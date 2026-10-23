/** Keep worker diagnostics in English internally so an active run can change UI language. */
const messages: Record<string, string> = {
  'Recognition cancelled. You can adjust the crop and try again.': '已取消识别。可以调整裁剪区域后重试。',
  'This image exceeds 25 MB. Resize it or upload a screenshot of the letter area.': '图片超过 25 MB。请缩小图片，或仅上传字母区的截图。',
  'This image is too large. Resize it to less than 45 megapixels before importing.': '图片过大。请将图片缩小到 4500 万像素以内再导入。',
  'The image could not be opened. Try a PNG or JPEG screenshot.': '无法打开图片，请尝试 PNG 或 JPEG 截图。',
  'Preparing the selected letter area…': '正在准备选中的字母区域…',
  'The selected area is too small. Include the complete letter columns.': '选中的区域太小，请包含完整的字母列。',
  'Your browser could not prepare the image.': '浏览器无法处理这张图片。',
  'Your browser could not prepare a column.': '浏览器无法处理图片中的字母列。',
  'Recognition finished. Review every column, then apply.': '识别完成。请逐列核对后再应用。',
  'Recognition stopped.': '识别已停止。',
  'The OCR worker could not start. Check your connection and try again.': '无法启动 OCR 后台任务。请检查网络连接后重试。',
  'Recognition failed. Check the crop and try again.': '识别失败。请检查裁剪区域后重试。',
  'Recognition failed. Check your connection for the initial OCR data download, then try again.': '识别失败。首次使用需要联网下载 OCR 数据，请检查网络后重试。',
  'This browser does not support background image processing. Use a current Chrome, Edge, Firefox or Safari.': '此浏览器不支持后台图片处理。请使用新版 Chrome、Edge、Firefox 或 Safari。',
  'Loading local OCR engine (the first use downloads English recognition data)…': '正在加载本地 OCR 引擎（首次使用会下载英文识别数据）…',
  'Reading letters and their positions…': '正在识别字母及其位置…',
  'No letters were detected. Check the crop, try the other recognition mode, or enter letters manually.': '未检测到字母。请检查裁剪区域、尝试另一种识别模式，或手动输入字母。',
  'The image width and column count must be positive.': '图片宽度和列数必须大于 0。',
  'Column guides must be finite, strictly increasing positions.': '列参考线的位置必须是有限数值，并且从左到右严格递增。',
  'Invalid image pixels.': '图片像素数据无效。',
  'An invalid OCR box was ignored.': '已忽略一个无效的 OCR 识别框。',
  'A symbol outside the selected letter area was ignored.': '已忽略选中字母区域以外的字符。',
  'Low confidence: compare these letters with the image.': '识别置信度较低，请对照原图核对这些字母。',
  'Check I / 1 / l and O / 0 shapes.': '请注意区分 I / 1 / l 和 O / 0。',
  'A merged OCR box was split using estimated positions; verify the letters and column.': '一个合并的识别框已按估计位置拆分，请核对字母及其所属列。',
  'A letter overlaps a column guide; check the crop and guides.': '有字母跨越列参考线，请检查裁剪区域和参考线位置。',
  'A letter touches the crop edge; check for clipped letters.': '有字母接触裁剪边缘，请检查是否被截断。',
  'Overlapping duplicate OCR detections were merged; verify this letter.': '已合并重叠的重复识别结果，请核对这个字母。',
  'No letters found. Verify whether this column is empty.': '未发现字母，请确认这一列是否为空。',
};

export function localizeOcrMessage(message: string, locale: 'en' | 'zh-CN'): string {
  if (locale === 'en' || !message) return message;
  if (typeof messages[message] === 'string') return messages[message];
  let match = /^Reading column (\d+) of (\d+)…$/.exec(message);
  if (match) return `正在识别第 ${match[1]} 列，共 ${match[2]} 列…`;
  match = /^Enter (\d+) increasing guide positions between 0 and 100, or leave blank for equal columns\.$/.exec(message);
  if (match) return `请输入 ${match[1]} 个在 0 到 100 之间递增的参考线位置；留空则等分各列。`;
  match = /^Unrecognized character “(.*)” was kept as \?; replace it or leave a wildcard\.$/.exec(message);
  if (match) return `无法识别的字符“${match[1]}”已保留为 ?，可以改正，也可以保留为未知字母。`;
  // Browser and Tesseract errors can carry useful network or decoding diagnostics.
  return `识别出错：${message}`;
}
