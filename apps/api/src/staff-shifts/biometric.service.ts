import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { PrismaService } from "../prisma/prisma.service";

const RP_NAME = "YallPos Asistencia";
const CHALLENGE_TTL_MS = 5 * 60_000;

type PendingChallenge = { challenge: string; expiresAt: number };

function rpFromOrigin(origin?: string) {
  if (!origin) throw new BadRequestException("Origen no válido para biometría");
  try {
    const url = new URL(origin);
    return { rpID: url.hostname, expectedOrigin: origin };
  } catch {
    throw new BadRequestException("Origen no válido para biometría");
  }
}

@Injectable()
export class BiometricService {
  constructor(private prisma: PrismaService) {}

  /** Challenges pendientes en memoria (instancia única) */
  private pending = new Map<string, PendingChallenge>();

  private storeChallenge(key: string, challenge: string) {
    this.pending.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  }

  private consumeChallenge(key: string): string {
    const entry = this.pending.get(key);
    this.pending.delete(key);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new BadRequestException("La solicitud expiró, intenta de nuevo");
    }
    // limpieza oportunista
    if (this.pending.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
    }
    return entry.challenge;
  }

  async listCredentials(userId: string) {
    const rows = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    });
    return rows;
  }

  async deleteCredential(userId: string, id: string) {
    await this.prisma.webAuthnCredential.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  async registrationOptions(userId: string, userName: string, origin?: string) {
    const { rpID } = rpFromOrigin(origin);
    const existing = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true },
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: Buffer.from(userId, "utf8"),
      userName,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    this.storeChallenge(`reg:${userId}`, options.challenge);
    return options;
  }

  async verifyRegistration(
    userId: string,
    origin: string | undefined,
    response: RegistrationResponseJSON,
    deviceName?: string,
  ) {
    const { rpID, expectedOrigin } = rpFromOrigin(origin);
    const expectedChallenge = this.consumeChallenge(`reg:${userId}`);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException("No se pudo verificar la huella");
    }

    const { credential } = verification.registrationInfo;
    await this.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        deviceName: deviceName?.trim() || null,
      },
    });

    return { ok: true };
  }

  async clockOptions(origin?: string) {
    const { rpID } = rpFromOrigin(origin);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: [],
    });
    const sessionId = crypto.randomUUID();
    this.storeChallenge(`auth:${sessionId}`, options.challenge);
    return { sessionId, options };
  }

  /** Verifica la huella y devuelve el usuario identificado (activo). */
  async identifyByAssertion(
    origin: string | undefined,
    sessionId: string,
    response: AuthenticationResponseJSON,
  ) {
    const { rpID, expectedOrigin } = rpFromOrigin(origin);
    const expectedChallenge = this.consumeChallenge(`auth:${sessionId}`);

    const stored = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!stored) {
      throw new UnauthorizedException("Huella no registrada. Regístrala primero desde tu sesión.");
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, "base64url"),
        counter: stored.counter,
        transports: stored.transports
          ? (stored.transports.split(",") as AuthenticatorTransportFuture[])
          : undefined,
      },
    });

    if (!verification.verified) {
      throw new UnauthorizedException("Huella no verificada");
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: stored.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, name: true, role: true, isActive: true, tenantId: true },
    });
    if (!user) throw new UnauthorizedException("Usuario no encontrado");
    return user;
  }
}
