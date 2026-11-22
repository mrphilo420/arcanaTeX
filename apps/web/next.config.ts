import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "radix-ui",
      "recharts",
      "date-fns",
    ],
  },
};

export default nextConfig;
