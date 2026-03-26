import { spawn } from "child_process";

/**
 * Start a cloudflared Quick Tunnel and return the public HTTPS URL.
 * If TUNNEL_URL env var is set, skip cloudflared and use that directly
 * (handles Tailscale Funnel, ngrok, or any manual tunnel).
 */
export async function startTunnel(port: number): Promise<string> {
  if (process.env.TUNNEL_URL) {
    const url = process.env.TUNNEL_URL.replace(/\/$/, "");
    console.log(`[tunnel] Using manual URL: ${url}`);
    return url;
  }

  return new Promise((resolve, reject) => {
    console.log(`[tunnel] Starting cloudflared quick tunnel on port ${port}...`);

    const proc = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const deadline = setTimeout(() => {
      proc.kill();
      reject(new Error("Tunnel start timed out after 30s"));
    }, 30_000);

    const tryExtract = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(deadline);
        console.log(`[tunnel] Public URL: ${match[0]}`);
        resolve(match[0]);
      }
    };

    proc.stdout.on("data", tryExtract);
    proc.stderr.on("data", tryExtract);

    proc.on("error", (err) => {
      clearTimeout(deadline);
      const hint =
        "cloudflared not found — install it with: brew install cloudflare/cloudflare/cloudflared\n" +
        "Or set TUNNEL_URL env var to use a manual tunnel (Tailscale, ngrok, etc.)";
      reject(new Error(`${hint}\n\nOriginal error: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(deadline);
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });
}
