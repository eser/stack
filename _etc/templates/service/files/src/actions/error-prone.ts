export const errorProneAction = () => {
  throw new Error("there is an unhandled error");
};

export { errorProneAction as default };
