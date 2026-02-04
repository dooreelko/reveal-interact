import { Construct } from "constructs";
import { ApiContainer, TBDFunction } from "@arinoto/cdk-arch";

/**
 * Options for DataStore construction.
 */
export interface DataStoreOptions<TDoc, TIndices extends keyof TDoc> {
  /**
   * Fields from TDoc that can be used for filtering in list().
   * Order matters for prefix-based storage backends (e.g., Cloudflare KV).
   * Implementations may use these for indexing/optimization.
   */
  indices?: TIndices[];
}

/**
 * Key type for stores with indices.
 * Contains all indexed fields plus a unique id.
 */
export type IndexedKey<TDoc, TIndices extends keyof TDoc> = Pick<TDoc, TIndices> & { id: string };

/**
 * Key type that adapts based on whether indices are defined.
 * - With indices: object containing all index fields + id
 * - Without indices: simple string
 */
export type StoreKey<TDoc, TIndices extends keyof TDoc> =
  [TIndices] extends [never] ? string : IndexedKey<TDoc, TIndices>;

/**
 * Generic data store for JSON documents.
 * Functions are TBD and must be overloaded by implementations.
 *
 * @template TDoc - The document type stored
 * @template TIndices - Keys of TDoc that can be used for filtering (default: never)
 */
export class DataStore<TDoc, TIndices extends keyof TDoc = never> extends ApiContainer {
  private readonly storeFunction: TBDFunction<[StoreKey<TDoc, TIndices>, TDoc], { success: boolean }>;
  private readonly getFunction: TBDFunction<[StoreKey<TDoc, TIndices>], TDoc[]>;
  private readonly listFunction: TBDFunction<[Partial<Pick<TDoc, TIndices>>?], TDoc[]>;

  /**
   * The indices configured for this store.
   */
  public readonly indices: TIndices[];

  constructor(scope: Construct, id: string, options?: DataStoreOptions<TDoc, TIndices>) {
    super(scope, id);

    this.indices = options?.indices ?? [];

    this.storeFunction = new TBDFunction(this, "store");
    this.getFunction = new TBDFunction(this, "get");
    this.listFunction = new TBDFunction(this, "list");

    this.addRoute('store', 'POST /store', this.storeFunction);
    this.addRoute('get', 'POST /store/get', this.getFunction);
    this.addRoute('list', 'POST /store/list', this.listFunction);
  }

  /**
   * Store a document with the given key.
   * For indexed stores, key must contain all index fields plus id.
   */
  async store(key: StoreKey<TDoc, TIndices>, doc: TDoc): Promise<{ success: boolean }> {
    return this.storeFunction.invoke(key, doc);
  }

  /**
   * Get documents by key.
   * For indexed stores, key must contain all index fields plus id.
   */
  async get(key: StoreKey<TDoc, TIndices>): Promise<TDoc[]> {
    return this.getFunction.invoke(key);
  }

  /**
   * List documents, optionally filtered by indexed fields.
   * @param filters - Optional filters on indexed fields
   * @throws Error if filters are provided but no indices are defined
   */
  async list(filters?: Partial<Pick<TDoc, TIndices>>): Promise<TDoc[]> {
    if (filters && Object.keys(filters).length > 0 && this.indices.length === 0) {
      throw new Error("Cannot filter by fields when no indices are defined for this DataStore");
    }
    return this.listFunction.invoke(filters);
  }
}
