/** Mostra o código TOTP atual de um segredo (somente contas de DEMONSTRAÇÃO locais). */
import { Secret, TOTP } from "otpauth";
import { readFileSync } from "node:fs";

const secret = process.argv[2] ?? JSON.parse(readFileSync(".demo-credentials.json", "utf8")).coach.totp_secret;
console.log(new TOTP({ secret: Secret.fromBase32(secret) }).generate());
