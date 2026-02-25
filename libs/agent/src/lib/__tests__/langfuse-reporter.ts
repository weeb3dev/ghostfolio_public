import type { EvalCategory } from './eval-helpers';

const DATASET_NAME = 'agentforge-congressional-evals';

export interface EvalResult {
  testName: string;
  category: EvalCategory;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  latencyMs: number;
  tokensUsed: number;
  toolsCalled: string[];
}

/**
 * Lazy-initialized Langfuse reporter. Avoids importing langfuse at
 * module load time so tests can run even when the langfuse package
 * has compatibility issues with Jest's VM environment.
 */
export class LangfuseEvalReporter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private langfuse: any = null;
  private datasetCreated = false;
  private initAttempted = false;

  get enabled(): boolean {
    return (
      Boolean(process.env['LANGFUSE_PUBLIC_KEY']) &&
      Boolean(process.env['LANGFUSE_SECRET_KEY'])
    );
  }

  private async init(): Promise<void> {
    if (this.initAttempted) return;
    this.initAttempted = true;

    if (!this.enabled) return;

    // langfuse-core's CJS bundle calls import() synchronously during require(),
    // which throws TypeError in Jest's VM context (no --experimental-vm-modules).
    // Detect Jest and skip — Langfuse reporting works in non-Jest runners.
    if (process.env['JEST_WORKER_ID'] !== undefined) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Langfuse } = require('langfuse') as { Langfuse: new (opts: { publicKey: string; secretKey: string }) => Record<string, unknown> };
      this.langfuse = new Langfuse({
        publicKey: process.env['LANGFUSE_PUBLIC_KEY']!,
        secretKey: process.env['LANGFUSE_SECRET_KEY']!
      });
    } catch {
      this.langfuse = null;
    }
  }

  async ensureDataset(): Promise<void> {
    await this.init();
    if (!this.langfuse || this.datasetCreated) return;

    try {
      await this.langfuse.createDataset({
        name: DATASET_NAME,
        description:
          'Eval results for the AgentForge AI financial agent tested against congressional portfolios',
        metadata: { version: '1.0' }
      });
      this.datasetCreated = true;
    } catch {
      this.datasetCreated = true;
    }
  }

  async report(result: EvalResult): Promise<void> {
    await this.init();
    if (!this.langfuse) return;

    await this.ensureDataset();

    await this.langfuse.createDatasetItem({
      datasetName: DATASET_NAME,
      input: { query: result.input },
      expectedOutput: { criteria: result.expectedOutput },
      metadata: {
        category: result.category,
        testName: result.testName,
        passed: result.passed,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
        toolsCalled: result.toolsCalled,
        timestamp: new Date().toISOString()
      }
    });
  }

  async flush(): Promise<void> {
    await this.init();
    if (!this.langfuse) return;
    await this.langfuse.flushAsync();
  }
}
