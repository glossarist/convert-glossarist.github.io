import { build } from 'esbuild';
import CssModulesPlugin from 'esbuild-css-modules-plugin';


build({
  entryPoints: [
    'src/index.tsx',
    // 'components/hello.world.jsx',
    // 'styles/app.modules.css',
    // 'styles/deep/styles/hello.modules.css',
  ],
  entryNames: '[dir]/[name]',
  assetNames: '[dir]/[name]',
  format: 'esm',
  target: ['esnext'],
  bundle: true,
  //external: ['react', 'react-dom'],
  minify: false,
  sourcemap: false,
  //publicPath: 'https://convertor.glossarist.org/',
  outdir: './dist/bundle',
  write: true,
  loader: {
    '.jpg': 'file',
    '.png': 'file',
  },
  logLevel: 'debug',
  plugins: [
    CssModulesPlugin(),
  ],
});
