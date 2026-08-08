import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // PIN THE WORKSPACE ROOT TO THIS REPO.
    //
    // Next infers the root as the highest directory containing a lockfile. A
    // stray `npm install` in C:\Users\Giof1 left a package-lock.json in the
    // HOME directory, so Next inferred the whole home folder as the workspace
    // and Turbopack tried to watch everything under it -- every other repo,
    // Documents, Downloads, OneDrive, and every node_modules in all of them.
    //
    // That is not a cosmetic warning. The dev server came up, bound port 3000,
    // and then never answered a request: connections were accepted and hung
    // until they timed out, while the file watcher worked through the home
    // directory. It looks exactly like a crashed app but nothing errors.
    //
    // Pinning the root here makes the inference irrelevant, so a stray
    // lockfile anywhere above this folder can never do it again.
    root: here,
  },
};

export default nextConfig;
