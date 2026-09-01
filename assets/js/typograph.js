(() => {
  const NBSP = '\u00A0';
  const NNBSP = '\u202F';
  const NBHY = '\u2011';

  const shortWords = [
    'а', 'и', 'но', 'да', 'ли', 'же', 'бы',
    'в', 'во', 'на', 'к', 'ко', 'с', 'со', 'о', 'об', 'обо',
    'от', 'по', 'за', 'до', 'из', 'изо', 'у', 'не', 'ни',
    'для', 'при', 'под', 'над', 'без', 'про', 'это'
  ].join('|');

  const shortWordPattern = new RegExp(`(^|[\\s(«„])(${shortWords})\\s+(?=\\S)`, 'giu');

  function formatText(text) {
    return text
      .replace(/ПМЭФ-2025/g, `ПМЭФ${NBHY}2025`)
      .replace(/товарно-деривативных/giu, `товарно${NBHY}деривативных`)
      .replace(/(ЕАЭС\+|БРИКС\+)\s*,\s*/g, `$1,${NBSP}`)
      .replace(/\s+и\s+(ШОС\.?)/g, `${NBSP}и${NBSP}$1`)
      .replace(shortWordPattern, (_, prefix, word) => `${prefix}${word}${NBSP}`)
      .replace(/(\d)\s+(?=(?:%|₽|€|\$)\b)/g, `$1${NNBSP}`)
      .replace(/(\d)\s+(?=(?:бирж|стран|участниц|лет|год|года)\b)/giu, `$1${NBSP}`);
  }

  function processElement(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('svg, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = formatText(node.nodeValue);
    });
  }

  processElement(document.body);
})();
