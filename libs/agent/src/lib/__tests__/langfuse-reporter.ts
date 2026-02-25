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
 * Pushes eval results to a Langfuse dataset via the REST API.
 * Uses fetch() directly to avoid the langfuse SDK's CJS/ESM
 * incompatibility with Jest's VM context.
 */
export class LangfuseEvalReporter {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private datasetCreated = false;
  private pendingRequests: Promise<void>[] = [];

  constructor() {
    this.baseUrl = (
      process.env['LANGFUSE_BASEURL'] || 'https://us.cloud.langfuse.com'
    ).replace(/\/+$/, '');

    const pub = process.env['LANGFUSE_PUBLIC_KEY'] ?? '';
    const sec = process.env['LANGFUSE_SECRET_KEY'] ?? '';
    this.authHeader = `Basic ${Buffer.from(`${pub}:${sec}`).toString('base64')}`;
  }

  get enabled(): boolean {
    return (
      Boolean(process.env['LANGFUSE_PUBLIC_KEY']) &&
      Boolean(process.env['LANGFUSE_SECRET_KEY'])
    );
  }

  private async fetchApi(
    path: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    const url = `${this.baseUrl}/api/public${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(
        `[LangfuseReporter] ${res.status} from ${path}: ${text.slice(0, 200)}`
      );
    }
    return res;
  }

  async ensureDataset(): Promise<void> {
    if (!this.enabled || this.datasetCreated) return;

    try {
      await this.fetchApi('/v2/datasets', {
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
    if (!this.enabled) return;

    await this.ensureDataset();

    const p = this.fetchApi('/dataset-items', {
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
        actualOutput: result.actualOutput,
        timestamp: new Date().toISOString()
      }
    }).then(() => undefined);

    this.pendingRequests.push(p);
    await p;
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.pendingRequests);
    this.pendingRequests = [];
  }
}
