import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "patelafarm.vercel.app" }],
        destination: "https://patelafarms.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
