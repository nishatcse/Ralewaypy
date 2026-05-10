declare module 'wink-bm25-text-search' {
    interface BM25Options {
        k1?: number;
        b?: number;
    }

    class WinkBM25<T = Record<string, unknown>> {
        constructor();
        defineConfig(config: { fldWeights: Record<keyof T, number>; bm25Params?: BM25Options }): void;
        addDoc(doc: T): void;
        search(query: string, limit?: number): Array<{ doc: T; score: number }>;
        consolidate(): void;
    }

    export = WinkBM25;
}
