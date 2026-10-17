import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  async redirects() {
    return [
      { source: "/workspaces", destination: "/workspace", permanent: false },
      { source: "/t/:tenant/timeline", destination: "/workspace/:tenant", permanent: false },
      { source: "/t/:tenant/board", destination: "/workspace/:tenant/agents", permanent: false },
      { source: "/t/:tenant/chat", has: [{ type: "query", key: "q", value: "(?<question>.+)" }], destination: "/workspace/:tenant?ask=:question", permanent: false },
      { source: "/t/:tenant/chat", destination: "/workspace/:tenant?ask=", permanent: false },
      { source: "/t/:tenant/skills", destination: "/workspace/:tenant/agents", permanent: false },
      { source: "/t/:tenant/sources", destination: "/workspace/:tenant/sources", permanent: false },
      { source: "/t/:tenant", destination: "/workspace/:tenant", permanent: false },
    ];
  },
};

export default nextConfig;
