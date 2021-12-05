import createRuntime from "../functions/createRuntime.ts";
import cli from "../functions/platforms/cli.ts";
import useMemo from "../hooks/useMemo.ts";

function main(args: string[]) {
	const options = {};

	const runtime = useMemo(
		() => createRuntime(cli, options),
		[],
	);

	// runtime.execute(
}

if (import.meta.main) {
	main(Deno.args);
}

export { main as default };
