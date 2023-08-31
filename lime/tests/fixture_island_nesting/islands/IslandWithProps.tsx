import { view } from "../../../src/runtime/drivers/view.ts";

export default function IslandWithProps(
  props: { foo: { bar: string } },
) {
  const [showText, setShowText] = view.useState(false)!;

  view.useEffect(() => {
    setShowText(true);
  }, []);

  return (
    <div className="island">
      <p>
        {showText ? props.foo.bar : "it doesn't work"}
      </p>
    </div>
  );
}
