/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@booking/ui", "@booking/db", "@booking/config"],
  experimental: {
    // Keep Prisma and bcrypt out of the bundle; they rely on native or filesystem resolution.
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

export default nextConfig;
