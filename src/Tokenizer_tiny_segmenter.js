class Tokenizer {
    constructor() {
        this.segmenter = new TinySegmenter();
    }

    async tokenize(text) {
        console.assert(text, `text is ${text}`);
        const tokens = this.segmenter.segment(text);
        const uniqTokens = Array.from(new Set(tokens));
        return uniqTokens;
    }

    async_tokenize(text) {
        const tokens = this.segmenter.segment(text);
        const uniqTokens = Array.from(new Set(tokens));
        return uniqTokens;
    }
}

トークンにできるかテスト: {
    (async () => {
        const token = await new Tokenizer().tokenize("すもももももももものうち");
        console.assert(JSON.stringify(token) == JSON.stringify(["すも", "も", "もの", "うち"]));
    })();
}
トークンにできるかテスト: {
    const tokenizer = new Tokenizer();
    setTimeout(
        () => {
            try {
                const token = tokenizer.async_tokenize("すもももももももものうち");
                console.assert(JSON.stringify(token) == JSON.stringify(["すも", "も", "もの", "うち"]));
            } catch (e) {
                console.error(e);
            }
        }, 5000
    )
}
tailが辞書に入ってるかチェック: {
    (async () => {
        const token = await new Tokenizer().tokenize("I like kemono's tail");
        console.assert(JSON.stringify(token) == JSON.stringify(["I", " ", "like", "kemono", "'", "s", "tail"]), token);
    })();
}