// Copyright 2023 the cool authors. All rights reserved. MIT license.

export default function Test(props: { message: string }) {
  return (
    <div>
      <p>{props.message}</p>
      <img
        id="img-in-island"
        src="/image.png"
        srcSet="/image.png 1x"
        height={130}
      />
    </div>
  );
}
