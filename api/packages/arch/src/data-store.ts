import { Construct } from "constructs";
import { TBDFunction } from "@arinoto/cdk-arch";

/**
 * Generic data store for JSON documents.
 * Functions are TBD and must be overloaded by implementations.
 */
export class DataStore<TDoc> extends Construct {
  public readonly storeFunction: TBDFunction<[string, TDoc], { success: boolean }>;
  public readonly getFunction: TBDFunction<[string], TDoc[]>;
  public readonly getAllFunction: TBDFunction<[], TDoc[]>;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.storeFunction = new TBDFunction(this, "store");
    this.getFunction = new TBDFunction(this, "get");
    this.getAllFunction = new TBDFunction(this, "getAll");
  }

  async store(key: string, doc: TDoc): Promise<{ success: boolean }> {
    return this.storeFunction.invoke(key, doc);
  }

  async get(key: string): Promise<TDoc[]> {
    return this.getFunction.invoke(key);
  }

  async getAll(): Promise<TDoc[]> {
    return this.getAllFunction.invoke();
  }
}
