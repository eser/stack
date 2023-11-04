interface Props {
  params: Record<string, string | Array<string>>;
}

export default function Greet(props: Props) {
  return <div>Hello {props.params["name"]}</div>;
}
