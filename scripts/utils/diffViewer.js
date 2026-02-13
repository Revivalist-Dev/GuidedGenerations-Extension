export function diffWords(oldText, newText) {
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);
    
    const matrix = Array(oldWords.length + 1).fill(null).map(() => Array(newWords.length + 1).fill(0));
    
    for (let i = 1; i <= oldWords.length; i++) {
        for (let j = 1; j <= newWords.length; j++) {
            if (oldWords[i - 1] === newWords[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }
    
    const result = [];
    let i = oldWords.length;
    let j = newWords.length;
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            result.unshift({ value: oldWords[i - 1], added: false, removed: false });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            result.unshift({ value: newWords[j - 1], added: true, removed: false });
            j--;
        } else {
            result.unshift({ value: oldWords[i - 1], added: false, removed: true });
            i--;
        }
    }
    
    // Merge consecutive changes of the same type
    const merged = [];
    for (const part of result) {
        const last = merged[merged.length - 1];
        if (last && last.added === part.added && last.removed === part.removed) {
            last.value += part.value;
        } else {
            merged.push(part);
        }
    }
    
    return merged;
}


