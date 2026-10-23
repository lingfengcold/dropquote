export type Locale = 'en' | 'zh-CN';
export const LOCALE_KEY = 'dropquote.locale.v1';

export function resolveLocale(saved: string | null, browserLanguage = 'en'): Locale {
  if (saved === 'en' || saved === 'zh-CN') return saved;
  return /^zh(?:-|$)/i.test(browserLanguage) ? 'zh-CN' : 'en';
}

const messages: Record<string, string> = {
  'Invalid dimensions.': '棋盘尺寸无效。',
  'Some columns have too many letters. Correct them before filling missing letters.': '部分列的字母过多，请先修正，再补齐缺失字母。',
  'This file does not contain a puzzle.': '文件中没有有效题目。',
  'Unsupported puzzle format. Expected version 1.': '不支持此题目格式，请使用版本 1。',
  'Each column must contain uppercase A–Z letters or ?, with no more letters than rows.': '每列只能包含大写字母 A–Z 或 ?，字母数量不能超过行数。',
  'The black-square grid does not match its dimensions.': '黑格数据与棋盘尺寸不匹配。',
  'Known letters must be A–Z or null in a grid of the same dimensions.': '已知字母必须是 A–Z 或空值，且所在网格的尺寸须与棋盘一致。',
  'A black square cannot also contain a known letter.': '黑格中不能同时填写已知字母。',
  'Puzzle files must be smaller than 2 MB.': '题目文件必须小于 2 MB。',
  'Puzzle imported. Check the grid and known letters before searching.': '题目已导入。搜索前请核对棋盘和已知字母。',
  'Could not read that puzzle.': '无法读取此题目。',
  'Example puzzle loaded. Find quotes to try the new search.': '示例已载入，点击“开始求解”即可试用。',
  'Search cancelled. You can edit the puzzle and start again.': '搜索已取消，可以修改题目后重新求解。',
  'The solver worker could not run. Retry loading it or check that the site assets are available.': '求解线程无法运行，请重试加载，或检查网站资源是否可访问。',
  'Web Workers are unavailable in this browser.': '此浏览器不支持后台线程。',
  'The dictionary is still loading. Wait for it or retry loading.': '词典仍在加载，请稍候或重试加载。',
  'Could not start the solver.': '无法启动求解器。',
  'timeLimitMs must be a finite, nonnegative number.': '搜索时限必须是有限的非负数。',
  'maxNodes must be a nonnegative integer.': '搜索节点上限必须是非负整数。',
  'maxResults must be a positive integer.': '候选结果上限必须是正整数。',
  'Grid rows and columns must be positive integers.': '棋盘行数和列数必须是正整数。',
  'Block grid dimensions must match rows and columns.': '黑格数据必须与棋盘行列数一致。',
  'Provide exactly one letter list per column.': '请为每列提供一组字母。',
  'Fixed-letter grid dimensions must match the puzzle.': '已知字母数据必须与棋盘尺寸一致。',
};

/** Translate diagnostics at render time so existing notices follow language changes. */
export function localizeMessage(message: string, locale: Locale): string {
  if (message === '内置词库资源格式不正确。') return locale === 'en' ? 'The bundled dictionary asset has an invalid format.' : message;
  if (message === '内置词库数据损坏，请重新加载页面。') return locale === 'en' ? 'The bundled dictionary data is damaged. Reload the page.' : message;
  if (locale === 'en') return message;
  if (typeof messages[message] === 'string') return messages[message];
  const dimensions = /^Use 1–(\d+) rows, 1–(\d+) columns, and at most (.+) cells\.$/.exec(message);
  if (dimensions) return `行数须为 1–${dimensions[1]}，列数须为 1–${dimensions[2]}，总格数最多 ${dimensions[3]}。`;
  const count = /^Column (\d+) has (\d+) letters, but (\d+) open cells\. Add \? for each missing letter\.$/.exec(message);
  if (count) return `第 ${count[1]} 列有 ${count[2]} 个字母、${count[3]} 个白格，请为每个缺失字母添加一个 ?。`;
  const fixed = /^Fixed letters exceed the available letters and \? in column (\d+)\.$/.exec(message);
  if (fixed) return `第 ${fixed[1]} 列的已知字母超出了可用字母和 ? 的范围。`;
  const invalid = /^Column (\d+) contains an invalid letter\.$/.exec(message);
  if (invalid) return `第 ${invalid[1]} 列包含无效字母。`;
  const single = /^Column (\d+): use single A–Z letters or \? for missing letters\.$/.exec(message);
  if (single) return `第 ${single[1]} 列只能使用单个 A–Z 字母，缺失字母请用 ? 表示。`;
  const position = /^Invalid fixed letter at row (\d+), column (\d+)\.$/.exec(message);
  if (position) return `第 ${position[1]} 行第 ${position[2]} 列的已知字母无效。`;
  const block = /^A block cannot have a fixed letter \(row (\d+), column (\d+)\)\.$/.exec(message);
  if (block) return `第 ${block[1]} 行第 ${block[2]} 列是黑格，不能填写已知字母。`;
  const custom = /^Invalid custom word: (.+)\. Use letters, apostrophes or hyphens\.$/.exec(message);
  if (custom) return `自定义词无效：${custom[1]}。请使用字母、撇号或连字符。`;
  return message;
}
