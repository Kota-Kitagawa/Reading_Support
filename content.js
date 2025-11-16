const dicPath = chrome.runtime.getURL("dict/");

kuromoji.builder({ dicPath: dicPath }).build(function(err, tokenizer) {
    if (err) {
        console.error("エラー: 形態素解析器 (Kuromoji.js) のロードに失敗しました。", 
                      "辞書ファイル(dict/)のパスや配置を確認してください。",
                      "エラー詳細:", err);
        return;
    }

    console.log("形態素解析器の準備が完了しました。");

    findAndProcessNovelBody(tokenizer);
});

// 本文要素を特定し、処理を開始する関数
function findAndProcessNovelBody(tokenizer) {
    const selector = 'div.p-novel__body';
    
    let attempts = 0;
    const maxAttempts = 30; 
    
    const intervalId = setInterval(() => {
        const novelHonbun = document.querySelector(selector);
        
        if (novelHonbun) {
            clearInterval(intervalId);
            console.log(`小説の本文要素 (${selector}) が見つかりました。ルビ振り処理を開始します。`);
            processHonbun(novelHonbun, tokenizer);
            
        } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.error("エラー: 小説の本文要素が見つかりませんでした。",
                          "指定されたセレクタ:", selector,
                          "→ このセレクタが現在のページのHTML構造と一致しているか、開発者ツールで確認してください。");
        }
        
        attempts++;
    }, 100);
}

// 本文の解析と書き換え処理
function processHonbun(novelHonbun, tokenizer) {
    
    let processedHtml = '';
    
    novelHonbun.childNodes.forEach(node => {
        if (node.nodeType === 3) { 
            processedHtml += processText(node.textContent, tokenizer);
        } else if (node.nodeType === 1) { 
            if (node.tagName === 'P' || node.tagName === 'DIV' || node.tagName === 'SPAN') {
                const innerText = node.textContent;
                const rubyText = processText(innerText, tokenizer);
                processedHtml += `<${node.tagName.toLowerCase()} class="${node.className}">${rubyText}</${node.tagName.toLowerCase()}>`;
            } else {
                processedHtml += node.outerHTML;
            }
        }
    });

    if (processedHtml) {
        novelHonbun.innerHTML = processedHtml;
        console.log("ルビ振り処理が完了しました。");
    }
}

// テキストを形態素解析し、ルビ（<ruby>タグ）を挿入する関数
function processText(text, tokenizer) {
    if (!text || text.trim() === '') return text;

    const tokens = tokenizer.tokenize(text);
    let resultHtml = '';

    tokens.forEach(token => {
        const surface = token.surface || token.surface_form || '';
        const reading = token.reading || ''; 
        if (surface && surface.match(/[\u4e00-\u9faf]/) && reading) {
            const hiragana = katakanaToHiragana(reading);
            const rubyTag = `<ruby>${surface}<rt>${hiragana}</rt></ruby>`;
            resultHtml += rubyTag;
        } else {
            resultHtml += surface;
        }
    });

    return resultHtml;
}
// カタカナをひらがなに変換する関数
function katakanaToHiragana(kata) {
    return kata.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}