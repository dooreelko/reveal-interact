import { Construct } from "constructs";
import { ApiContainer, TBDFunction } from "@arinoto/cdk-arch";

/**
 * Generic data store for JSON documents.
 * Functions are TBD and must be overloaded by implementations.
 */
export class DataStore<TDoc> extends ApiContainer {
  private readonly storeFunction: TBDFunction<[string, TDoc], { success: boolean }>;
  private readonly getFunction: TBDFunction<[string], TDoc[]>;
  private readonly getAllFunction: TBDFunction<[], TDoc[]>;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.storeFunction = new TBDFunction(this, "store");
    this.getFunction = new TBDFunction(this, "get");
    this.getAllFunction = new TBDFunction(this, "getAll");

    this.addRoute('store', 'POST /store/{key}', this.storeFunction);
    this.addRoute('get', 'GET /store/{key}', this.getFunction);
    this.addRoute('getAll', 'GET /store', this.getAllFunction);
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
