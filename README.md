# Dropquote Solver

浏览器中的英文 Dropquote 求解器：输入每列可用字母、标记黑格分词，再按列约束搜索完整引文。文字按行连续阅读，**换行本身不结束单词，黑格才结束单词**。

## 这次改进

1. **重写图片识别流程**：支持裁剪、调整列界、逐列识别与整体识别，按字母的图像位置分列；识别结果先审阅和修改，再手动应用，避免短列、空位导致整行错列。
2. **重写搜索与排序**：按单词候选搜索，使用前缀索引、约束传播和优先处理候选较少的位置；结合真实语料词频及相邻词关系排序，去除把指定生僻词当作常用词提升的规则。
3. **大型题在 Worker 中运行**：求解、OCR 预处理与识别运行在 Web Worker 中，页面可继续响应；提供搜索进度、时间/节点预算及取消操作。
4. **补充实际解题工具**：缺失字母 `?`、按列自动补缺、锁定已知字母、额外词和人名、候选全文复制/下载、题目 JSON 导入导出及本地草稿。
5. **中英文界面**：页顶及图片导入窗口提供 **中文 / English** 切换，包含进度、错误提示和结果说明，并记住选择。

## 使用方法

首次打开时根据浏览器语言选择中文或英文；之后优先使用已保存的选择。切换立即生效，保留当前题目、搜索设置、进行中的搜索与图片导入状态。此选项只切换界面语言，题目和候选答案保持英文，OCR 仍使用英文识别数据。

1. 设置答案区的行数和列数，或选择 **Try an example**。题目上方的字母库每列可以有不同高度。
2. 在 **Column letters** 输入各列字母。列内顺序不限，但不能把字母移到其他列。也可以粘贴每列一行的内容，空列写 `-`，或选择 **Read image**。
3. 在答案区标记黑格；每列字母数量须等于该列白格数量。切到 **Known letters** 可把已经确定的字母填入白格，清空即可解除锁定。
4. 可补充 **Extra words / names**，用空白、逗号或分号分隔。撇号和连字符会按纯字母单词归一化，例如 `O'NEILL` → `ONEILL`。遇到连写复合词时，可选择 **Allow joined words**，详见下方说明。
5. 选择搜索时间和搜索力度，点击 **Find quotes**。候选按分数显示，可查看完整网格、复制引文或下载文本。**Adjust puzzle** 返回修改；受预算限制时可提高预算重新搜索。

### 缺失字母与 `?`

**每个 `?` 表示当前列恰好缺失的一个未知字母**，不是整列未知，也不是任意长度占位符。例如某列有 5 个白格，只识别出 `AET`，可输入 `AET??`。题目整列未知时，要输入与该列白格数相同数量的 `?`。

网格编辑器提供 **Fill missing letters with ?**，会分别计算各列的缺口并补足；已有多余字母时应先更正，工具不会删除它们，也不会跨列调配字母。求解结果中的 **Letters supplied for ?** 按列列出候选为这些未知位置补入的字母。

`?` 越多，可能答案越多；已知字母能明显缩小搜索范围。

### 连写复合词

**Allow joined words** 默认关闭。开启后允许把两个各含至少 3 个字母的常见词或明确补充的额外词拼在同一个词槽，例如 `NOSE` + `CLIP` → `NOSECLIP`；不需要先把整个复合词手工加入词库。组件默认按词频分数筛选，避免罕见名字和缩写任意拼接。此模式适合包含新复合词、主题词表等材料，会扩大候选范围与搜索工作量。

结果会标出这些词及其组成部分，供人工审阅。两个合法单词连在一起不一定是成立的复合词；生成候选也不保证符合题目主题。额外词和复合词功能都会扩充可搜索的候选，不代表保证它们是答案。

### 图片 OCR

- 上传图片后，裁剪到**字母库区域**，排除题目说明和答案区。字母库可能在棋盘上方或下方；保留左右完整列宽，裁剪不要只紧贴最边缘字母的笔画。
- 列界默认等宽；不等宽图片可以调整内部列界百分比。保持从左到右递增，并使列界与原题各列对齐。
- **Each column** 为推荐模式；**Whole area** 一次识别整个区域，再按坐标分列，可用于对比结果。默认去除长表格线，可关闭后对比；检查处理后的预览，尤其是容易与线条混淆的 `I` 以及贴线的 `L`、`T`。
- 识别后逐列审阅、修正漏字和多字，不确定的字母改成 `?`。只有点击 **Apply** 后才会写入题目；识别中可取消，也可关闭导入窗口。

**图片在浏览器本地处理，不会上传给 OCR 服务。** 首次使用需要从 CDN 下载 Tesseract 引擎和英文语言数据；下载不畅时检查网络，或先手动输入列字母。求解词库已经随应用打包，不依赖远程词典服务。

### 保存与继续

题目会保存为当前浏览器的本地草稿。使用 **Save puzzle** 下载 JSON 备份，再通过 **Import puzzle JSON** 恢复列字母、黑格和已知字母。草稿属于当前设备与浏览器；需要迁移或长期保留时使用 JSON 文件。

### 如何理解结果

搜索会同时受时间和节点预算约束。到达预算时保留已找到的完整候选；**受限搜索没有候选，不代表题目无解**。取消会终止当前搜索并返回编辑，重新搜索会从头开始。

即使搜索完成，结论也只适用于当前词库、补充词与输入约束。人名、罕见词或 OCR 错误都可能使预期答案缺失。分数用于比较同一道题的候选，**不是正确概率，也不保证最高分就是出题人的答案**。

## 本地开发

需要 **Node.js 22.12+** 和 npm，以及支持 Web Worker、Canvas 和 `DecompressionStream` 的现代浏览器。

```sh
npm ci
npm run dev
```

打开开发服务器显示的地址，默认是 `http://localhost:5173/dropquote/`。

```sh
npm test              # 词库、求解、OCR 处理与题目数据等单元/集成测试
npm run typecheck     # TypeScript 检查
npm run bench         # 使用真实内置词库的搜索性能统计
npm run build         # 类型检查并生成 dist/
npm run preview       # 预览构建产物
```

性能脚本输出词库构建、搜索节点、耗时、答案排名及大型题的预算状态，方便在实际机器上比较改动。

### 浏览器测试

先构建，再运行 Playwright：

```sh
npm run build
npm run test:e2e
```

测试配置在本地默认使用 Microsoft Edge，CI 使用 Chromium；运行环境需安装相应浏览器。CI 中可通过 `npx playwright install --with-deps chromium` 准备 Chromium。测试会启动构建产物的本地预览服务器，覆盖真实 Worker 求解、缺失字母、取消、保存与导入，以及语言切换、语言偏好保存和中英文移动端布局等流程。

真正下载并运行 Tesseract 的 OCR 验收是**可选测试**，默认跳过，避免常规测试依赖外部 CDN。开启方式：

```sh
# Bash
RUN_OCR_E2E=1 npm run test:e2e -- e2e/ocr.spec.ts
```

```powershell
# PowerShell
$env:RUN_OCR_E2E = '1'
npm run test:e2e -- e2e/ocr.spec.ts
Remove-Item Env:RUN_OCR_E2E
```

如果测试环境访问 CDN 需要代理，可以另外设置 `OCR_PROXY` 为自己的 HTTP 代理地址，例如 PowerShell 中的 `$env:OCR_PROXY = 'http://127.0.0.1:7890'`。此变量只供 Playwright 的 OCR 测试使用，本地预览地址会绕过代理。实际 OCR 测试需要网络下载时间，覆盖不等高字母列、非零裁剪起点、逐列和整体模式、结果审阅与手动应用。

## 部署

当前 Vite 的 `base` 是 **`/dropquote/`**，适用于本仓库的 GitHub Pages 项目路径。部署到其他路径时需调整 [vite.config.ts](./vite.config.ts) 的 `base` 并重新构建。

**必须部署完整的 `dist/` 目录，包括 `assets/` 下的所有 Worker 和其他资源。不能只复制 `index.html`，也不能当作单 HTML 文件直接打开。** 使用 GitHub Pages 或普通 HTTP 静态服务器提供文件；仓库中的 GitHub Actions 工作流会构建并上传完整 `dist/`。

求解不需要后端。首次 OCR 所用的 CDN 下载与网站静态文件缓存是独立的；本项目没有承诺首次访问即可完全离线使用。

## 词库来源与许可

内置 **396,376 个归一化英文词项**，由两层组成，总压缩数据约 1.51 MB：

- **297,822 个有词频排名的词项**：来源为 **Robyn Speer** 的 [wordfreq](https://github.com/rspeer/wordfreq) 多语域英文频率数据，包括书籍、字幕、新闻、百科与网络等来源。派生频率数据采用 **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**，并向 **Marc Brysbaert 及其他 SUBTLEX 作者**、Google Books Ngram Viewer 和 OpenSubtitles 等来源致谢。
- **98,554 个普通字典补充词项**：来源为 [Wordnik wordlist](https://github.com/wordnik/wordlist)，**Copyright (c) 2020 Wordnik，MIT License**。它扩大可搜索的低频词范围，不给补充词编造频率或人工提高排名。

两层均保留固定来源版本和归属。词库范围与语料词频分别管理；这些数据许可与应用代码分开说明。

- [词库来源、归属和本项目的处理方式](./src/data/README.md)
- [上游原始 NOTICE](./src/data/wordfreq-NOTICE.md)
- [完整 CC BY-SA 4.0 许可](./src/data/CC-BY-SA-4.0.txt)
- [Wordnik MIT 许可](./src/data/wordnik-LICENSE.txt)
- [源版本、文件大小及 SHA-256 清单](./src/data/lexicon-manifest.json)
- [Wordnik 补充词库生成清单](./src/data/wordnik-manifest.json)

词库随 Worker 内嵌，使用时无需从 raw GitHub 下载。开发者可用 Python 3 标准库重新生成固定版本数据：

```sh
python scripts/build-lexicon.py
python scripts/build-wordnik-tail.py
```

脚本校验固定源文件的 SHA-256，再生成确定性压缩数据；也支持指定已经下载的源目录进行离线重建，详见词库目录说明。
