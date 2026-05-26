/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  // Uncomment and set when deploying to https://<user>.github.io/<repo-name>/
  // basePath: "/lottery-defi",
  images: { unoptimized: true },
};

module.exports = nextConfig;
