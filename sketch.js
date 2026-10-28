// 從 CSV 題庫載入題目，每輪隨機抽取六題。
const QUESTION_BANK_URL = "question_bank.csv"; // 可改貼公開的 Google Drive 或 Google 試算表分享連結。
let questionTable;
let questionBank = [];
let quizItems = [];

function preload() { // 在測驗初始化前載入 CSV 題庫。
  questionTable = loadTable(resolveQuestionBankUrl(), "csv", "header"); // 讀取本機或雲端 CSV。
} // 結束題庫載入。

function resolveQuestionBankUrl(sourceUrl = QUESTION_BANK_URL) { // 將常見 Google 分享網址轉成可讀取的 CSV 網址。
  const driveFile = sourceUrl.match(/drive\.google\.com\/file\/d\/([^/?]+)/) || sourceUrl.match(/drive\.google\.com\/open\?id=([^&]+)/); // 擷取 Google Drive 檔案 ID。
  if (driveFile) { // Drive 分享連結需轉成直接下載網址。
    return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`; // 回傳公開檔案下載網址。
  } // 結束 Drive 網址處理。
  const sheet = sourceUrl.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/); // 判斷是否為 Google 試算表連結。
  if (sheet && !/\/pub(?:\?|$)/.test(sourceUrl)) { // 非發布版連結轉成 CSV 匯出格式。
    const sheetUrl = new URL(sourceUrl); // 解析分享網址中的工作表分頁 ID。
    const sheetId = sheetUrl.searchParams.get("gid") || "0"; // 未指定分頁時使用第一個工作表。
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${sheetId}`; // 回傳 CSV 匯出網址。
  } // 結束試算表網址處理。
  return sourceUrl; // 保留本機路徑或已是 CSV 的網址。
} // 結束網址轉換。

// 記錄每張情境卡目前配對到的答案編號。
let placedAnswers = Array(6).fill(null); // 空格代表尚未完成配對。
// 記錄拖曳中的答案編號。
let draggingAnswer = null; // null 代表目前沒有正在拖曳的答案。
// 記錄拖曳時游標與答案卡片的偏移量。
let dragOffset = { x: 0, y: 0 }; // 保留抓取位置，讓卡片不會跳動。
// 記錄測驗是否已提交。
let submitted = false; // 提交後鎖定配對並顯示成績。
// 記錄答對題數。
let finalScore = 0; // 以答對題數換算百分比。
// 記錄正確答案數量供成績文字顯示。
let correctAnswers = 0; // 顯示答對題數而非百分比小數。
// 記錄彩帶粒子。
let confettiPieces = []; // 高分時建立並持續更新彩帶。
// 記錄交卷按鈕的位置與尺寸。
let submitButton = { x: 0, y: 0, w: 0, h: 0 }; // 由畫布尺寸動態計算按鈕位置。
// 記錄重玩按鈕的位置與尺寸。
let restartButton = { x: 0, y: 0, w: 0, h: 0 }; // 成績畫面提供重新挑戰入口。
// 記錄六個答案卡片的位置與尺寸。
let answerCards = []; // 每次繪製前依螢幕大小重新排版。
// 記錄六張題目卡片的位置與尺寸。
let targetCards = []; // 卡片本身固定在上方配對區。

// 建立全螢幕畫布並設定文字顯示方式。
function setup() { // p5.js 初始化入口。
  createCanvas(windowWidth, windowHeight); // 讓畫布填滿瀏覽器視窗。
  questionBank = questionTable.getRows().map((row) => ({ // 將 CSV 每列轉成測驗題目物件。
    icon: row.getString("icon"), // 取得圖示種類。
    clue: row.getString("clue"), // 取得情境提示。
    answer: row.getString("answer"), // 取得配對答案。
    spokenText: row.getString("spokenText"), // 取得語音說明。
    color: row.getString("color") // 取得題目識別色。
  })); // 完成題庫資料轉換。
  quizItems = pickQuestions(); // 首次開始時隨機抽取六題。
  textFont("Trebuchet MS, Arial, sans-serif"); // 使用清楚易讀的圓潤字體。
  textAlign(CENTER, CENTER); // 讓標題與卡片文字自然置中。
  textWrap(CHAR); // 讓放大的中文答案依字元換行並留在卡片範圍內。
  rectMode(CORNER); // 使用左上角座標繪製矩形。
  noStroke(); // 預設不顯示形狀外框。
} // 結束初始化。

// 依畫布大小更新畫面並繪製所有測驗內容。
function draw() { // p5.js 每一影格呼叫一次。
  background("#f8f7f1"); // 使用明亮柔和的紙感底色。
  drawBackgroundDetails(); // 繪製不干擾閱讀的背景裝飾。
  drawHeader(); // 繪製標題、進度與操作提示。
  calculateLayout(); // 依裝置尺寸計算題目與答案卡位置。
  drawTargets(); // 繪製上方六個固定的動畫情境。
  drawAnswers(); // 繪製下方可拖曳文字答案。
  drawFooter(); // 繪製交卷或成績操作區。
  updateAndDrawConfetti(); // 更新並繪製高分彩帶。
} // 結束單一影格繪製。

// 繪製頁面角落的柔和裝飾圖形。
function drawBackgroundDetails() { // 保持背景有層次又不遮住題目。
  fill("#e8f0e5"); // 設定淡綠色裝飾。
  circle(width - 42, 42, 110); // 右上角的圓形背景點綴。
  fill("#f5e7d7"); // 設定淡橘色裝飾。
  circle(30, height - 28, 100); // 左下角的圓形背景點綴。
} // 結束背景裝飾繪製。

// 繪製標題與目前答題進度。
function drawHeader() { // 標題區採窄而清楚的版面。
  const compact = width < 700; // 判斷是否使用小螢幕排版。
  const titleSize = compact ? 23 : 30; // 小螢幕採用較緊湊的標題字級。
  fill("#24473d"); // 設定深綠色標題文字。
  textSize(titleSize); // 套用標題字級。
  textStyle(BOLD); // 讓測驗名稱醒目易讀。
  text("生活小達人", width / 2, compact ? 29 : 38); // 顯示測驗名稱。
  textStyle(NORMAL); // 還原一般字重供其他文字使用。
  fill("#71817a"); // 設定提示文字顏色。
  textSize(compact ? 12 : 14); // 依裝置大小調整提示字級。
  text("拖曳答案，幫每個小朋友找到正確的生活好習慣", width / 2, compact ? 55 : 68); // 顯示玩法提示。
  const completed = placedAnswers.filter((answer) => answer !== null).length; // 統計已完成配對數。
  fill("#dce8df"); // 設定進度底條顏色。
  rect(width / 2 - 72, compact ? 69 : 88, 144, 7, 4); // 繪製進度底條。
  fill("#69a889"); // 設定進度填滿顏色。
  rect(width / 2 - 72, compact ? 69 : 88, 144 * completed / 6, 7, 4); // 顯示目前配對進度。
} // 結束標題與進度繪製。

// 根據視窗大小安排上方題目卡與下方答案卡。
function calculateLayout() { // 設定自適應的網格座標。
  const compact = width < 700; // 小螢幕採用三欄題目與兩欄答案。
  const top = compact ? 91 : 119; // 設定題目區起始高度。
  const bottom = compact ? height - 133 : height - 182; // 手機版放寬答案區並為底部按鈕保留空間。
  const targetColumns = compact ? 3 : 6; // 桌面一列六張，手機兩列各三張。
  const targetRows = 6 / targetColumns; // 計算題目卡列數。
  const horizontalPadding = compact ? 14 : 30; // 設定卡片與畫布邊界間距。
  const targetGap = compact ? 9 : 14; // 設定題目卡間距。
  const targetWidth = (width - horizontalPadding * 2 - targetGap * (targetColumns - 1)) / targetColumns; // 計算題目卡寬度。
  const targetAreaHeight = compact ? min(270, max(186, height * 0.31)) : 230; // 加高題目區讓幼兒看清楚圖片。
  const targetHeight = (targetAreaHeight - targetGap * (targetRows - 1)) / targetRows; // 計算單張題目卡高度。
  targetCards = []; // 清空舊位置避免視窗變更後殘留。
  for (let index = 0; index < 6; index += 1) { // 逐一計算六張題目卡座標。
    const column = index % targetColumns; // 計算目前卡片所在欄。
    const row = floor(index / targetColumns); // 計算目前卡片所在列。
    targetCards.push({ x: horizontalPadding + column * (targetWidth + targetGap), y: top + row * (targetHeight + targetGap), w: targetWidth, h: targetHeight }); // 儲存題目卡範圍。
  } // 結束題目卡排版。
  const answerTop = top + targetAreaHeight + (compact ? 53 : 73); // 設定答案區起始高度。
  const answerColumns = compact ? 2 : 3; // 手機兩欄，桌面三欄。
  const answerRows = 6 / answerColumns; // 計算答案卡列數。
  const answerGap = compact ? 9 : 12; // 設定答案卡間距。
  const answerWidth = (width - horizontalPadding * 2 - answerGap * (answerColumns - 1)) / answerColumns; // 計算答案卡寬度。
  const availableAnswerHeight = max(42, bottom - answerTop - (compact ? 6 : 0)); // 計算答案區可用高度。
  const answerHeight = min(compact ? 62 : 68, (availableAnswerHeight - answerGap * (answerRows - 1)) / answerRows); // 加高答案卡並依可用空間自動縮放。
  answerCards = []; // 清空舊答案卡座標。
  for (let index = 0; index < 6; index += 1) { // 逐一計算六張答案卡座標。
    const column = index % answerColumns; // 計算目前答案所在欄。
    const row = floor(index / answerColumns); // 計算目前答案所在列。
    answerCards.push({ x: horizontalPadding + column * (answerWidth + answerGap), y: answerTop + row * (answerHeight + answerGap), w: answerWidth, h: answerHeight }); // 儲存答案卡範圍。
  } // 結束答案卡排版。
  const buttonWidth = min(220, width - 40); // 讓交卷按鈕在窄螢幕仍保有邊界。
  submitButton = { x: (width - buttonWidth) / 2, y: height - (compact ? 59 : 69), w: buttonWidth, h: compact ? 44 : 50 }; // 設定交卷按鈕範圍。
  restartButton = { x: (width - buttonWidth) / 2, y: height - (compact ? 59 : 69), w: buttonWidth, h: compact ? 44 : 50 }; // 設定重新挑戰按鈕範圍。
} // 結束響應式排版計算。

// 繪製六個固定情境卡與動畫圖像提示。
function drawTargets() { // 上方圖像提示固定顯示在網格位置。
  for (let index = 0; index < 6; index += 1) { // 依序繪製每個情境卡。
    const card = targetCards[index]; // 取得目前題目卡位置。
    const item = quizItems[index]; // 取得目前題目的圖示資料。
    const assigned = placedAnswers[index]; // 取得目前放入的答案編號。
    fill("#ffffff"); // 設定題目卡片底色。
    rect(card.x, card.y, card.w, card.h, 13); // 繪製白色圓角情境卡。
    fill(item.color); // 設定題目卡頂端的辨識色。
    rect(card.x, card.y, card.w, 5, 3); // 繪製題目卡彩色頂線。
    drawAnimatedIcon(item.icon, card); // 繪製會隨時間變化的生活圖像。
    fill("#40584f"); // 設定提示文字顏色。
    textStyle(BOLD); // 讓短提示清楚易讀。
    textSize(width < 700 ? 16 : 18); // 放大生活情境提示方便幼兒閱讀。
    text(item.clue, card.x + card.w / 2, card.y + card.h - (width < 700 ? 16 : 20)); // 顯示簡短生活情境並置中。
    textStyle(NORMAL); // 還原一般文字字重。
    if (assigned !== null) { // 若已配對則顯示成功狀態。
      fill("#e5f3e8"); // 設定成功提示底色。
      circle(card.x + card.w - 13, card.y + 15, 19); // 繪製完成標記圓底。
      fill("#327c58"); // 設定完成標記顏色。
      textSize(13); // 設定完成符號大小。
      text("✓", card.x + card.w - 13, card.y + 15); // 顯示已完成符號。
    } // 結束完成狀態繪製。
  } // 結束題目卡繪製。
} // 結束情境卡繪製。

// 依題目種類繪製簡單且持續動態變化的動畫插圖。
function drawAnimatedIcon(icon, card) { // 以 p5.js 圖形取代外部圖片檔，避免額外載入依賴。
  const centerX = card.x + card.w / 2; // 計算圖像中心橫座標。
  const centerY = card.y + card.h * 0.43; // 計算圖像中心縱座標。
  const iconSize = min(card.w * 0.68, card.h * 0.52, width < 700 ? 66 : 92); // 放大動畫插圖並依卡片尺寸自動調整。
  const pulse = sin(frameCount * 0.06) * 2; // 產生平滑的呼吸動畫位移。
  push(); // 儲存圖形狀態避免影響其他卡片。
  translate(centerX, centerY + pulse); // 移動座標原點並套用輕柔浮動效果。
  if (icon.startsWith("hands_")) { // 依洗手時機搭配不同情境物件。
    fill("#ffd19b"); // 設定手掌的膚色。
    ellipse(-iconSize * 0.16, 2, iconSize * 0.43, iconSize * 0.5); // 繪製左側手掌。
    ellipse(iconSize * 0.16, 2, iconSize * 0.43, iconSize * 0.5); // 繪製右側手掌。
    fill("#68bddd"); // 設定水滴顏色。
    ellipse(0, -iconSize * 0.31 + sin(frameCount * 0.12) * 2, iconSize * 0.13, iconSize * 0.2); // 繪製跳動水滴。
    fill("#ffffff"); // 設定泡泡顏色。
    circle(-iconSize * 0.3, -iconSize * 0.25, iconSize * 0.12); // 繪製洗手泡泡。
    circle(iconSize * 0.31, -iconSize * 0.19, iconSize * 0.1); // 繪製另一顆泡泡。
    if (icon === "hands_snack") { // 點心前洗手搭配水果提示。
      fill("#e97963"); // 設定蘋果果實顏色。
      circle(-iconSize * 0.38, iconSize * 0.18, iconSize * 0.22); // 繪製點心蘋果。
      fill("#57965a"); // 設定蘋果葉片顏色。
      ellipse(-iconSize * 0.35, iconSize * 0.03, iconSize * 0.12, iconSize * 0.07); // 繪製蘋果葉片。
    } else if (icon === "hands_toilet") { // 如廁後洗手搭配水龍頭提示。
      fill("#78b8b2"); // 設定水龍頭顏色。
      rect(iconSize * 0.24, -iconSize * 0.38, iconSize * 0.1, iconSize * 0.24, 4); // 繪製水龍頭直管。
      rect(iconSize * 0.12, -iconSize * 0.4, iconSize * 0.28, iconSize * 0.1, 4); // 繪製水龍頭出水口。
      fill("#68bddd"); // 設定水滴顏色。
      ellipse(iconSize * 0.3, -iconSize * 0.08, iconSize * 0.1, iconSize * 0.16); // 繪製流下的水滴。
    } else { // 玩完玩具洗手搭配積木提示。
      fill("#f2c968"); // 設定積木顏色。
      rect(-iconSize * 0.42, -iconSize * 0.06, iconSize * 0.19, iconSize * 0.19, 3); // 繪製黃色積木。
      fill("#ef7470"); // 設定第二塊積木顏色。
      rect(iconSize * 0.29, -iconSize * 0.02, iconSize * 0.17, iconSize * 0.17, 3); // 繪製紅色積木。
    } // 結束洗手情境提示。
  } else if (icon.startsWith("teeth_")) { // 繪製刷牙圖示並依時段增加提示。
    fill("#fffdf5"); // 設定牙齒顏色。
    ellipse(-3, 0, iconSize * 0.53, iconSize * 0.57); // 繪製微笑的牙齒。
    fill("#ed7772"); // 設定牙刷柄顏色。
    push(); // 暫存旋轉前的圖形狀態。
    rotate(-0.55 + sin(frameCount * 0.1) * 0.08); // 讓牙刷產生輕柔刷動。
    rect(iconSize * 0.13, -iconSize * 0.12, iconSize * 0.12, iconSize * 0.53, 5); // 繪製牙刷柄。
    fill("#78b8b2"); // 設定刷毛顏色。
    rect(iconSize * 0.08, -iconSize * 0.2, iconSize * 0.22, iconSize * 0.13, 3); // 繪製牙刷刷頭。
    pop(); // 還原旋轉前的圖形狀態。
    if (icon === "teeth_morning") { // 早上刷牙搭配太陽提示。
      fill("#f2c968"); // 設定太陽顏色。
      circle(-iconSize * 0.36, -iconSize * 0.28, iconSize * 0.2); // 繪製晨間太陽。
    } else if (icon === "teeth_night") { // 晚上刷牙搭配月亮提示。
      fill("#a187c8"); // 設定月亮顏色。
      circle(-iconSize * 0.36, -iconSize * 0.28, iconSize * 0.2); // 繪製夜間月亮。
      fill("#ffffff"); // 設定星星顏色。
      circle(-iconSize * 0.1, -iconSize * 0.36, iconSize * 0.07); // 繪製夜空星星。
    } else { // 吃甜點後刷牙搭配糖果提示。
      fill("#ed7772"); // 設定糖果顏色。
      circle(-iconSize * 0.36, -iconSize * 0.28, iconSize * 0.17); // 繪製糖果中心。
      triangle(-iconSize * 0.47, -iconSize * 0.28, -iconSize * 0.57, -iconSize * 0.36, -iconSize * 0.57, -iconSize * 0.2); // 繪製糖果包裝左側。
      triangle(-iconSize * 0.25, -iconSize * 0.28, -iconSize * 0.15, -iconSize * 0.36, -iconSize * 0.15, -iconSize * 0.2); // 繪製糖果包裝右側。
    } // 結束刷牙時段提示。
  } else if (icon.startsWith("road_")) { // 依交通情境繪製不同道路提示。
    fill("#5d6771"); // 設定道路顏色。
    rect(-iconSize * 0.47, -iconSize * 0.26, iconSize * 0.94, iconSize * 0.56, 5); // 繪製道路。
    if (icon === "road_crossing") { // 過馬路搭配斑馬線。
      fill("#ffffff"); // 設定斑馬線白色條紋。
      for (let stripe = -1; stripe <= 1; stripe += 1) { // 逐條繪製斑馬線。
        rect(stripe * iconSize * 0.23 - iconSize * 0.055, -iconSize * 0.2, iconSize * 0.11, iconSize * 0.43, 2); // 繪製一條斑馬線。
      } // 結束斑馬線繪製。
    } else if (icon === "road_signal") { // 紅綠燈情境搭配號誌。
      fill("#3d4b52"); // 設定號誌外框顏色。
      rect(iconSize * 0.28, -iconSize * 0.42, iconSize * 0.25, iconSize * 0.58, 6); // 繪製號誌外框。
      fill("#ef7470"); // 設定紅燈顏色。
      circle(iconSize * 0.405, -iconSize * 0.3, iconSize * 0.13); // 繪製紅燈。
      fill(frameCount % 100 < 70 ? "#65b581" : "#f3c75d"); // 讓通行燈號緩慢變化。
      circle(iconSize * 0.405, -iconSize * 0.02, iconSize * 0.13); // 繪製綠燈或黃燈。
    } else { // 人行道情境搭配安全步行區。
      fill("#8e9b91"); // 設定人行道顏色。
      rect(-iconSize * 0.47, -iconSize * 0.4, iconSize * 0.94, iconSize * 0.18, 3); // 繪製人行道。
      fill("#f2c968"); // 設定行人衣服顏色。
      circle(-iconSize * 0.23, -iconSize * 0.22, iconSize * 0.15); // 繪製行人頭部。
      rect(-iconSize * 0.28, -iconSize * 0.15, iconSize * 0.1, iconSize * 0.26, 4); // 繪製行人身體。
      stroke("#f2c968"); // 設定行人手腳顏色。
      strokeWeight(3); // 加粗行人線條。
      line(-iconSize * 0.24, iconSize * 0.06, -iconSize * 0.34, iconSize * 0.2); // 繪製行人腿部。
      line(-iconSize * 0.22, iconSize * 0.06, -iconSize * 0.12, iconSize * 0.2); // 繪製另一側腿部。
      noStroke(); // 還原無外框狀態。
    } // 結束道路情境提示。
  } else if (icon.startsWith("trash_")) { // 依垃圾處理方式繪製提示圖案。
    fill(icon === "trash_recycle" ? "#61a9a0" : "#75a4d5"); // 回收桶使用綠色，其餘垃圾桶使用藍色。
    rect(-iconSize * 0.28, -iconSize * 0.12, iconSize * 0.56, iconSize * 0.49, 6); // 繪製桶身。
    rect(-iconSize * 0.34, -iconSize * 0.2, iconSize * 0.68, iconSize * 0.1, 4); // 繪製桶蓋。
    if (icon === "trash_recycle") { // 回收情境搭配循環標誌。
      fill("#ffffff"); // 設定回收標誌顏色。
      textSize(iconSize * 0.33); // 依圖示大小調整標誌。
      text("↻", 0, iconSize * 0.12); // 繪製回收循環符號。
    } else if (icon === "trash_litter") { // 撿拾紙屑情境搭配地面紙片。
      fill("#fff4d6"); // 設定紙屑顏色。
      push(); // 暫存旋轉狀態。
      rotate(-0.2); // 讓紙片稍微傾斜。
      rect(iconSize * 0.2, -iconSize * 0.38, iconSize * 0.18, iconSize * 0.22, 2); // 繪製待撿拾紙屑。
      pop(); // 還原旋轉狀態。
      fill("#ffd19b"); // 設定手部膚色。
      ellipse(iconSize * 0.36, -iconSize * 0.03, iconSize * 0.16, iconSize * 0.1); // 繪製伸手撿紙的手。
    } else { // 一般丟垃圾情境搭配紙團。
      fill("#fff4d6"); // 設定紙團顏色。
      circle(iconSize * 0.2, -iconSize * 0.35 + sin(frameCount * 0.11) * 3, iconSize * 0.2); // 繪製投入桶中的紙團。
    } // 結束垃圾處理提示。
  } else if (icon.startsWith("sleep_")) { // 睡前情境依內容繪製床鋪或收納玩具。
    if (icon === "sleep_bed") { // 準備上床搭配床鋪與月亮。
      fill("#a187c8"); // 設定床鋪顏色。
      rect(-iconSize * 0.42, iconSize * 0.08, iconSize * 0.84, iconSize * 0.27, 8); // 繪製床架與床墊。
      fill("#fffdf5"); // 設定枕頭顏色。
      rect(-iconSize * 0.33, -iconSize * 0.02, iconSize * 0.25, iconSize * 0.17, 6); // 繪製枕頭。
      fill("#f2c968"); // 設定月亮顏色。
      circle(iconSize * 0.28, -iconSize * 0.23, iconSize * 0.23); // 繪製睡前月亮。
    } else { // 收玩具搭配積木收納盒。
      fill("#75a4d5"); // 設定收納盒顏色。
      rect(-iconSize * 0.36, -iconSize * 0.04, iconSize * 0.72, iconSize * 0.38, 6); // 繪製玩具收納盒。
      fill("#f2c968"); // 設定積木顏色。
      rect(-iconSize * 0.25, -iconSize * 0.24, iconSize * 0.19, iconSize * 0.19, 4); // 繪製黃色積木。
      fill("#ef7470"); // 設定第二塊積木顏色。
      rect(iconSize * 0.06, -iconSize * 0.3, iconSize * 0.2, iconSize * 0.24, 4); // 繪製紅色積木。
    } // 結束睡前情境提示。
  } else if (icon === "veggie_meal") { // 繪製健康蔬菜情境。
    fill("#fffdf5"); // 設定餐盤顏色。
    circle(0, 0, iconSize * 0.78); // 繪製盛裝蔬菜的餐盤。
    fill("#e86f68"); // 設定番茄顏色。
    circle(-iconSize * 0.17, iconSize * 0.05, iconSize * 0.34); // 繪製番茄果實。
    fill("#57965a"); // 設定蔬菜葉片顏色。
    ellipse(-iconSize * 0.18, -iconSize * 0.2, iconSize * 0.22, iconSize * 0.13); // 繪製番茄葉片。
    ellipse(iconSize * 0.2, -iconSize * 0.1 + sin(frameCount * 0.08) * 2, iconSize * 0.35, iconSize * 0.2); // 繪製擺動的綠葉。
    fill("#f6d477"); // 設定玉米顏色。
    ellipse(iconSize * 0.18, iconSize * 0.16, iconSize * 0.2, iconSize * 0.32); // 繪製玉米棒。
  } // 結束圖示種類判斷。
  pop(); // 還原圖形狀態。
} // 結束動畫圖示繪製。

// 繪製下方六個可拖曳文字答案。
function drawAnswers() { // 已使用的答案會在下方保留原位並顯示已放置狀態。
  for (let index = 0; index < 6; index += 1) { // 逐一繪製每個文字選項。
    const card = answerCards[index]; // 取得目前答案卡位置。
    const isPlaced = placedAnswers.includes(index); // 判斷這個答案是否已經使用。
    const isDragging = draggingAnswer === index; // 判斷這張卡是否正在被拖曳。
    const position = isDragging ? { x: mouseX - dragOffset.x, y: mouseY - dragOffset.y, w: card.w, h: card.h } : card; // 拖曳中使用游標座標。
    fill(isPlaced ? "#e5e9e5" : "#ffffff"); // 已使用答案淡化，其餘答案保持白底。
    rect(position.x, position.y, position.w, position.h, 11); // 繪製答案卡片。
    if (!isPlaced) { // 可用答案才顯示彩色短邊。
      fill(quizItems[index].color); // 使用對應題目的識別色。
      rect(position.x, position.y, 5, position.h, 3); // 繪製答案卡左側識別線。
    } // 結束答案識別線繪製。
    fill(isPlaced ? "#9aa69f" : "#344c43"); // 設定答案文字顏色。
    textStyle(isPlaced ? NORMAL : BOLD); // 未使用答案以粗體呈現。
    textSize(width < 700 ? 16 : 18); // 放大答案字級方便幼兒閱讀。
    text(quizItems[index].answer, position.x + 12, position.y + position.h / 2, position.w - 20, position.h - 4); // 顯示答案文字並限制在卡片內。
    textStyle(NORMAL); // 還原一般文字字重。
    if (isDragging) { // 拖曳時浮起卡片增加操作回饋。
      drawingContext.shadowColor = "rgba(30, 60, 45, 0.22)"; // 設定柔和的卡片陰影。
      drawingContext.shadowBlur = 18; // 設定陰影模糊程度。
      drawingContext.shadowOffsetY = 7; // 設定陰影向下偏移。
      fill("#ffffff"); // 重繪浮起的卡片底色。
      rect(position.x, position.y, position.w, position.h, 11); // 繪製浮起的答案卡。
      drawingContext.shadowBlur = 0; // 清除陰影以免影響其他元素。
      drawingContext.shadowOffsetY = 0; // 還原陰影垂直位移。
      fill("#344c43"); // 設定浮起答案文字顏色。
      textStyle(BOLD); // 強調正在拖曳的答案。
      text(quizItems[index].answer, position.x + 12, position.y + position.h / 2, position.w - 20, position.h - 4); // 重繪浮起卡片上的文字。
      textStyle(NORMAL); // 還原一般文字字重。
    } // 結束拖曳狀態繪製。
  } // 結束答案卡繪製。
} // 結束可拖曳選項繪製。

// 繪製交卷按鈕、完成提示與成績畫面。
function drawFooter() { // 操作區固定在畫布底部。
  if (!submitted && placedAnswers.every((answer) => answer !== null)) { // 六題全部配對後才顯示交卷按鈕。
    drawButton(submitButton, "交卷看成績", "#327c58"); // 顯示可點擊的交卷按鈕。
  } else if (!submitted) { // 還有題目未完成時顯示進度提示。
    fill("#71817a"); // 設定提示文字顏色。
    textSize(width < 700 ? 12 : 14); // 設定提示文字大小。
    text("把六個答案都拖到上方合適的位置", width / 2, submitButton.y + submitButton.h / 2); // 提醒完成全部配對。
  } else { // 已提交時顯示成績與重新挑戰按鈕。
    fill("#24473d"); // 設定成績文字顏色。
    textStyle(BOLD); // 強調成績結果。
    textSize(width < 700 ? 19 : 24); // 依裝置大小調整成績字級。
    text(`答對 ${correctAnswers}/6 題，得分 ${finalScore}%`, width / 2, restartButton.y - 28); // 顯示答對題數與百分比。
    textStyle(NORMAL); // 還原一般文字字重。
    drawButton(restartButton, "再玩一次", "#327c58"); // 顯示重新挑戰按鈕。
  } // 結束頁尾狀態判斷。
} // 結束頁尾繪製。

// 繪製一致風格的互動按鈕。
function drawButton(button, label, buttonColor) { // 以傳入的矩形與顏色繪製按鈕。
  fill(buttonColor); // 設定按鈕主色。
  rect(button.x, button.y, button.w, button.h, 12); // 繪製圓角按鈕底板。
  fill("#ffffff"); // 設定按鈕文字為白色。
  textStyle(BOLD); // 強調按鈕文字。
  textSize(width < 700 ? 15 : 16); // 設定易讀的按鈕字級。
  text(label, button.x + button.w / 2, button.y + button.h / 2); // 將按鈕文字置中。
  textStyle(NORMAL); // 還原一般文字字重。
} // 結束按鈕繪製。

// 處理答案卡片的按下與開始拖曳。
function mousePressed() { // p5.js 滑鼠按下事件。
  for (let index = 0; index < targetCards.length; index += 1) { // 先判斷是否點擊上方情境圖片。
    if (pointInside(mouseX, mouseY, targetCards[index])) { // 點到圖片卡時播放該題的生活提示。
      speakQuestion(index); // 用親切語音朗讀題目與生活說明。
      return false; // 播報後結束事件，不啟動答案拖曳。
    } // 結束圖片卡點擊判斷。
  } // 結束圖片卡命中檢查。
  if (submitted) { // 已提交狀態只接受重新挑戰操作。
    if (pointInside(mouseX, mouseY, restartButton)) { // 判斷是否點擊重新挑戰按鈕。
      resetQuiz(); // 清除結果並重新開始測驗。
    } // 結束重新挑戰判斷。
    return false; // 阻止瀏覽器預設滑鼠行為。
  } // 結束已提交狀態判斷。
  if (placedAnswers.every((answer) => answer !== null) && pointInside(mouseX, mouseY, submitButton)) { // 全部完成且點擊交卷時提交答案。
    submitQuiz(); // 計算分數並顯示結果。
    return false; // 結束本次滑鼠事件。
  } // 結束交卷按鈕判斷。
  for (let index = 5; index >= 0; index -= 1) { // 從最上層卡片開始檢查命中位置。
    const card = answerCards[index]; // 取得目前答案卡位置。
    if (!placedAnswers.includes(index) && pointInside(mouseX, mouseY, card)) { // 只允許拖曳尚未使用的答案。
      draggingAnswer = index; // 設定目前被拖曳的答案。
      dragOffset.x = mouseX - card.x; // 記錄游標相對卡片左側的偏移。
      dragOffset.y = mouseY - card.y; // 記錄游標相對卡片上側的偏移。
      return false; // 停止繼續檢查其他卡片。
    } // 結束答案卡命中判斷。
  } // 結束答案卡片命中檢查。
  return false; // 阻止瀏覽器預設拖曳行為。
} // 結束滑鼠按下處理。

// 處理拖曳答案放入題目卡的配對判定。
function mouseReleased() { // p5.js 滑鼠放開事件。
  if (draggingAnswer === null) { // 沒有拖曳答案時不進行配對。
    return false; // 結束滑鼠放開事件。
  } // 結束無拖曳狀態判斷。
  const answerIndex = draggingAnswer; // 暫存答案編號供後續檢查。
  const dropX = mouseX - dragOffset.x + answerCards[answerIndex].w / 2; // 計算答案卡放開時中心點的橫座標。
  const dropY = mouseY - dragOffset.y + answerCards[answerIndex].h / 2; // 計算答案卡放開時中心點的縱座標。
  let targetIndex = -1; // 預設沒有命中題目卡。
  for (let index = 0; index < targetCards.length; index += 1) { // 檢查六張題目卡的投放範圍。
    if (pointInside(dropX, dropY, targetCards[index])) { // 判斷答案中心是否落在題目卡內。
      targetIndex = index; // 記錄命中的題目卡編號。
      break; // 命中後不必再檢查其他題目卡。
    } // 結束題目卡命中判斷。
  } // 結束投放範圍檢查。
  if (targetIndex !== -1 && placedAnswers[targetIndex] === null) { // 只有空白題目位置接受新答案。
    placedAnswers[targetIndex] = answerIndex; // 將答案放入指定題目位置。
  } // 結束答案放置判斷。
  draggingAnswer = null; // 結束拖曳狀態。
  return false; // 阻止瀏覽器預設滑鼠行為。
} // 結束滑鼠放開處理。

// 將答案放入題目卡時更新完成配對狀態。
function mouseDragged() { // p5.js 持續拖曳事件。
  return false; // 阻止瀏覽器選取文字或拖曳頁面。
} // 結束持續拖曳處理。

// 處理觸控裝置的按下事件並沿用滑鼠拖曳邏輯。
function touchStarted() { // p5.js 觸控開始事件。
  mousePressed(); // 使用相同邏輯選取答案卡或按鈕。
  return false; // 阻止頁面跟著手指捲動。
} // 結束觸控開始處理。

// 處理觸控裝置的拖曳事件。
function touchMoved() { // p5.js 觸控移動事件。
  return false; // 讓畫布接管手指拖曳。
} // 結束觸控移動處理。

// 處理觸控裝置的放開事件。
function touchEnded() { // p5.js 觸控結束事件。
  mouseReleased(); // 使用相同邏輯完成答案配對。
  return false; // 阻止瀏覽器觸控預設行為。
} // 結束觸控結束處理。

// 判斷一個座標點是否位於指定矩形範圍內。
function pointInside(pointX, pointY, rectangle) { // 將命中測試抽成共用工具。
  return pointX >= rectangle.x && pointX <= rectangle.x + rectangle.w && pointY >= rectangle.y && pointY <= rectangle.y + rectangle.h; // 回傳座標是否落在矩形內。
} // 結束矩形命中判斷。

// 點擊情境圖時使用瀏覽器語音合成播放親切的繁體中文說明。
function speakQuestion(index) { // 以使用者點擊作為播放語音的觸發動作。
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { // 確認瀏覽器支援語音合成。
    return; // 不支援時安靜略過，避免中斷測驗操作。
  } // 結束語音支援檢查。
  window.speechSynthesis.cancel(); // 停止上一題尚未播放完的語音。
  const narration = new window.SpeechSynthesisUtterance(quizItems[index].spokenText); // 建立目前題目的語音內容。
  narration.lang = "zh-TW"; // 指定使用繁體中文（台灣）發音。
  narration.rate = 0.88; // 稍微放慢語速，讓幼兒容易聽清楚。
  narration.pitch = 1.14; // 提高音調，營造親切活潑的語氣。
  narration.volume = 1; // 使用清楚的正常播放音量。
  const voices = window.speechSynthesis.getVoices(); // 取得裝置目前提供的語音清單。
  const chineseVoice = voices.find((voice) => /zh[-_]TW|zh[-_]Hant/i.test(voice.lang)) || voices.find((voice) => /^zh/i.test(voice.lang)); // 優先選台灣繁體中文聲線。
  if (chineseVoice) { // 裝置有中文聲線時套用偏好的聲音。
    narration.voice = chineseVoice; // 使用找到的中文語音。
  } // 結束語音選擇。
  window.speechSynthesis.speak(narration); // 開始朗讀目前題目。
} // 結束題目語音播放。

// 計算測驗分數並依成績決定是否發射彩帶。
function submitQuiz() { // 提交後進入只讀成績狀態。
  correctAnswers = placedAnswers.filter((answer, index) => answer === index).length; // 計算答案與題目索引相同的題數。
  finalScore = round(correctAnswers / quizItems.length * 100); // 換算為百分制成績。
  submitted = true; // 鎖定答案並顯示結果。
  if (finalScore > 80) { // 成績高於百分之八十時播放慶祝效果。
    createConfetti(); // 建立彩帶粒子。
  } // 結束高分判斷。
} // 結束交卷與評分。

// 建立多色彩帶粒子並給予不同的飄落速度。
function createConfetti() { // 彩帶只在高分結果中出現。
  const colors = ["#e76f51", "#f2c14e", "#4f9d78", "#5687c7", "#dc6c91"]; // 設定適合兒童畫面的彩帶色彩。
  confettiPieces = []; // 清除上一輪殘留的彩帶。
  for (let index = 0; index < 130; index += 1) { // 建立足夠覆蓋全畫面的彩帶。
    confettiPieces.push({ x: random(width), y: random(-height, -20), size: random(5, 10), speed: random(2, 5), drift: random(-1.4, 1.4), spin: random(TWO_PI), color: random(colors) }); // 儲存每片彩帶的動畫狀態。
  } // 結束彩帶粒子建立。
} // 結束彩帶初始化。

// 更新彩帶位置並繪製旋轉動畫。
function updateAndDrawConfetti() { // 每一影格持續更新彩帶。
  if (confettiPieces.length === 0) { // 沒有彩帶時略過粒子繪製。
    return; // 結束彩帶更新。
  } // 結束空粒子判斷。
  for (const piece of confettiPieces) { // 逐片更新並繪製彩帶。
    piece.y += piece.speed; // 讓彩帶向下飄落。
    piece.x += piece.drift + sin(frameCount * 0.04 + piece.spin) * 0.7; // 加入左右飄移效果。
    piece.spin += 0.08; // 更新彩帶旋轉角度。
    if (piece.y > height + 14) { // 彩帶落出畫面後從頂端重新出現。
      piece.y = random(-50, -10); // 將彩帶移回畫布上方。
      piece.x = random(width); // 隨機設定新的橫向位置。
    } // 結束彩帶循環判斷。
    push(); // 暫存圖形狀態。
    translate(piece.x, piece.y); // 移動畫布原點至彩帶位置。
    rotate(piece.spin); // 旋轉彩帶形成飄落效果。
    fill(piece.color); // 設定彩帶顏色。
    rect(-piece.size / 2, -piece.size / 3, piece.size, piece.size * 0.55, 2); // 繪製一片小彩帶。
    pop(); // 還原圖形狀態。
  } // 結束彩帶逐片更新。
} // 結束彩帶動畫繪製。

// 清除作答結果並重新開始一輪測驗。
function resetQuiz() { // 重新挑戰時恢復初始狀態。
  quizItems = pickQuestions(); // 重新開始時從完整題庫抽取新的一組題目。
  placedAnswers = Array(6).fill(null); // 清除所有已配對答案。
  draggingAnswer = null; // 清除拖曳狀態。
  submitted = false; // 重新開放作答。
  finalScore = 0; // 清除上一輪成績。
  correctAnswers = 0; // 清除上一輪答對題數。
  confettiPieces = []; // 停止並移除彩帶。
} // 結束測驗重設。

// 從完整題庫中不重複抽取六題。
function pickQuestions() { // 每輪使用洗牌後的前六筆資料。
  return shuffle(questionBank.slice()).slice(0, 6); // 複製題庫再洗牌，避免改動原始順序。
} // 結束隨機抽題。

// 瀏覽器視窗變更時同步調整全螢幕畫布。
function windowResized() { // p5.js 視窗尺寸變更事件。
  resizeCanvas(windowWidth, windowHeight); // 讓畫布重新貼合目前視窗。
} // 結束畫布尺寸更新。
