export interface RuntimeSecretSource {
  getSecret(name: string): string;
}

/** Local/development secret source. Replace with a dedicated secret manager in deployment. */
export class EnvironmentRuntimeSecretSource implements RuntimeSecretSource {
  constructor(
    private readonly env:
      Readonly<
        Record<
          string,
          string | undefined
        >
      > = process.env,
  ) {}

  getSecret(name: string): string {
    const value = this.env[name];
    if (!value || !value.trim()) {
      throw new Error(`runtime_secret_missing:${name}`);
    }
    return value.trim();
  }
}
