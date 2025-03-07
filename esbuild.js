const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`> ${location.file}:${location.line}:${location.column}: ${text}`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const copyStylesPlugin = {
	name: 'copy-styles',
	setup(build) {
		build.onEnd(() => {
			// Create the output directory if it doesn't exist
			const stylesDir = path.join(__dirname, 'dist', 'webview', 'styles');
			if (!fs.existsSync(stylesDir)) {
				fs.mkdirSync(stylesDir, { recursive: true });
			}

			// Copy CSS files
			const srcStylesDir = path.join(__dirname, 'src', 'webview', 'styles');
			if (fs.existsSync(srcStylesDir)) {
				const cssFiles = fs.readdirSync(srcStylesDir).filter(file => file.endsWith('.css'));
				cssFiles.forEach(file => {
					const srcPath = path.join(srcStylesDir, file);
					const destPath = path.join(stylesDir, file);
					fs.copyFileSync(srcPath, destPath);
					console.log(`Copied ${srcPath} to ${destPath}`);
				});
			}
		});
	}
};

async function main() {
	// Build extension
	const extensionCtx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	// Build webview
	const webviewCtx = await esbuild.context({
		entryPoints: [
			'src/webview/main.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/webview/main.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
			copyStylesPlugin,
		],
	});

	if (watch) {
		await Promise.all([
			extensionCtx.watch(),
			webviewCtx.watch()
		]);
	} else {
		await extensionCtx.rebuild();
		await webviewCtx.rebuild();
		await extensionCtx.dispose();
		await webviewCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
