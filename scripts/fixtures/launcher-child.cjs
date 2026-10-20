// Synthetic subprocess only: never starts Convex, Vite, or a network service.
const mode = process.argv[2];
if (mode === "parse") {
  console.log(require("shell-quote").parse("x ".repeat(128_000)).length);
} else if (mode === "hold") {
  console.log("waiting");
  setTimeout(() => process.exit(0), 5_000);
} else if (mode === "fail") {
  setTimeout(() => process.exit(7), 300);
} else {
  console.log(JSON.stringify(process.argv.slice(2)));
}
