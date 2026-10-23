import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';

export interface SessionBridge {
  endpoint: string;
  close(): Promise<void>;
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startSessionBridge(launch: (sessionId: string) => void): Promise<SessionBridge> {
  const token = randomBytes(32).toString('hex');
  const server = createServer((request, response) => {
    const expectedPrefix = `/${token}/`;
    const path = request.url ?? '';
    const sessionId = path.startsWith(expectedPrefix) ? path.slice(expectedPrefix.length) : '';
    if (
      request.method !== 'POST' ||
      !sessionIdPattern.test(sessionId) ||
      (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') ||
      request.headers['transfer-encoding'] !== undefined
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      launch(sessionId);
      response.writeHead(202).end();
    } catch {
      response.writeHead(500).end();
    }
  });
  try {
    await listen(server);
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('No bridge port');
    return {
      endpoint: `http://127.0.0.1:${address.port}/${token}`,
      close: () => new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      }),
    };
  } catch (error) {
    server.close();
    throw error;
  }
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}
