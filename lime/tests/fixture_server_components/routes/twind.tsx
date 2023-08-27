export default async function Styles() {
  await new Promise((r) => setTimeout(r, 10));
  return <h1 class="text-3xl text-red-600 font-bold">it works</h1>;
}
