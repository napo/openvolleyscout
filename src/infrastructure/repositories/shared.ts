export class RepositoryError extends Error {
  constructor(repositoryName: string, operation: string, cause?: unknown) {
    super(`${repositoryName}: failed to ${operation}`);
    this.name = 'RepositoryError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }

  cause?: unknown;
}

export function cloneEntity<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export async function withRepositoryError<T>(
  repositoryName: string,
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new RepositoryError(repositoryName, operation, error);
  }
}
