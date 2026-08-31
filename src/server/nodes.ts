import type { BscNodeInfo } from './types.js';

interface NodesDashboardResponse {
  bsc?: {
    nodes?: BscNodeInfo[];
    meta?: Record<string, unknown>;
  };
}

export class BscNodePool {
  constructor(private readonly dashboardUrl = process.env.NODES_DASHBOARD_URL ?? 'http://localhost:8080/api/data') {}

  async healthyWsNodes(): Promise<BscNodeInfo[]> {
    const response = await fetch(this.dashboardUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`nodes_dashboard_http_${response.status}`);
    const data = await response.json() as NodesDashboardResponse;
    const nodes = data.bsc?.nodes ?? [];
    return nodes
      .filter((node) => node.chainId === 56 && node.healthy && node.ws_subscribe && Boolean(node.ws_url))
      .sort((a, b) => (a.lag ?? 9999) - (b.lag ?? 9999));
  }

  async bestWsUrl(): Promise<string> {
    const nodes = await this.healthyWsNodes();
    const url = nodes[0]?.ws_url;
    if (!url) throw new Error('no_healthy_bsc_ws_node');
    return url;
  }

  async bestWsUrls(limit = 3): Promise<string[]> {
    const urls = (await this.healthyWsNodes())
      .map((node) => node.ws_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, limit);
    if (!urls.length) throw new Error('no_healthy_bsc_ws_node');
    return urls;
  }

  async healthyHttpNodes(): Promise<BscNodeInfo[]> {
    const response = await fetch(this.dashboardUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`nodes_dashboard_http_${response.status}`);
    const data = await response.json() as NodesDashboardResponse;
    const nodes = data.bsc?.nodes ?? [];
    return nodes
      .filter((node) => node.chainId === 56 && node.healthy && Boolean(node.http_url))
      .sort((a, b) => (a.lag ?? 9999) - (b.lag ?? 9999));
  }

  async bestHttpUrls(limit = 3): Promise<string[]> {
    const urls = (await this.healthyHttpNodes())
      .map((node) => node.http_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, limit);
    if (!urls.length) throw new Error('no_healthy_bsc_http_node');
    return urls;
  }
}
