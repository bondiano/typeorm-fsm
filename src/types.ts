export type AllowedNames = string | number;

export type Callback<
  Context extends object,
  T extends Array<any> = Array<any>,
> =
  | ((context: Context, ...arguments_: T) => Promise<void>)
  | ((context: Context, ...arguments_: T) => void);

export type Guard<Context extends object, T extends Array<any> = Array<any>> =
  | ((context: Context, ...arguments_: T) => boolean)
  | ((context: Context, ...arguments_: T) => Promise<boolean>);

export interface ITransition<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
> {
  from: State;
  event: Event;
  to: State;
  onEnter?: Callback<Context>;
  onExit?: Callback<Context>;
  guard?: Guard<Context>;
}
