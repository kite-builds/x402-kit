import { X402DashboardClient } from "@x402-kit/dashboard";

export function getServerConfig(): { baseUrl: string; authToken?: string } {
  const baseUrl = process.env.X402_URL ?? "http://localhost:3000";
  const authToken = process.env.X402_AUTH_TOKEN || undefined;
  return { baseUrl, authToken };
}

export function getDashboardClient(): X402DashboardClient {
  const { baseUrl, authToken } = getServerConfig();
  return new X402DashboardClient({ baseUrl, authToken });
}
