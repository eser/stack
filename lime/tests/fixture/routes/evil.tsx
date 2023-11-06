// Copyright 2023 the cool authors. All rights reserved. MIT license.

import Test from "../islands/Test.tsx";

export default function EvilPage() {
  return (
    <div>
      <Test message={`</script><script>alert('test')</script>`} />
    </div>
  );
}
