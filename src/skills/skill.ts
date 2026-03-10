export interface OpenClawSkill<Input, Output> {
  readonly name: string;
  readonly description: string;
  run(input: Input): Promise<Output>;
}
