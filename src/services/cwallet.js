const exchange = require("./exchange");
const cwalletSession = require("../lib/cwalletSession");
const { transactionPreCheck } = require("./cwalletSecurity");
const config = require("../config");

const BALANCE_PATH = "/cctip/v1/account/asset/balance/get";
const USDT_MERGE_ID = "8e5741cf-6e51-4892-9d04-3d40e1dd0128";

/** Discord 네트워크 value → Cwallet chain_id / network 라벨 */
const NETWORK_MAP = {
  USDT: { bep20: "BSC", trc20: "TRX" },
  TRX: { trc20: "TRX" },
  LTC: { ltc: "LTC" },
  BNB: { bep20: "BSC" },
};

const NETWORK_LABEL = {
  USDT: { bep20: "BEP20", trc20: "TRC20" },
  BNB: { bep20: "BEP20" },
  TRX: { trc20: "TRC20" },
  LTC: { ltc: "LTC" },
};

function hasSession() {
  return cwalletSession.hasStorageState();
}

function parseBalanceRow(row) {
  const sym = String(row.symbol || "").toUpperCase();
  const bal = parseFloat(row.balance ?? row.quantity ?? 0) || 0;
  return { ...row, symbol: sym, balance: Math.max(0, bal) };
}

async function fetchBalanceRows() {
  if (!hasSession()) return [];
  const data = await cwalletSession.postApi(BALANCE_PATH);
  if (!data || data.code !== 10000 || !Array.isArray(data.data)) return [];
  return data.data.map(parseBalanceRow);
}

async function getAllBalances() {
  const rows = await fetchBalanceRows();
  const result = {};
  for (const c of exchange.SUPPORTED) result[c] = 0;
  for (const row of rows) {
    if (!exchange.SUPPORTED.includes(row.symbol)) continue;
    if (row.type === "MERGE") {
      result[row.symbol] = row.balance;
    } else if (!result[row.symbol]) {
      result[row.symbol] = row.balance;
    }
  }
  return result;
}

async function getMergeTokenId(symbol) {
  const upper = symbol.toUpperCase();
  const rows = await fetchBalanceRows();
  const merge = rows.find(
    (r) => r.symbol === upper && String(r.type).toUpperCase() === "MERGE"
  );
  return merge?.token_id || null;
}

async function resolveChainToken(symbol, network) {
  const upper = symbol.toUpperCase();
  const mergeId = await getMergeTokenId(upper);
  if (!mergeId) return { ok: false, error: `${upper} 토큰 정보 없음` };

  const chainsRes = await cwalletSession.postApi(
    "/cctip/v1/chain/token/chains/get",
    { token_id: mergeId }
  );
  const raw = chainsRes?.data;
  const chains = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.lists)
      ? raw.lists
      : [];

  const netKey = String(network || "").toLowerCase();
  const chainHint = NETWORK_MAP[upper]?.[netKey];
  const labelHint = NETWORK_LABEL[upper]?.[netKey];

  let picked = chains.find(
    (c) =>
      (labelHint && String(c.network).toUpperCase() === labelHint) ||
      (chainHint &&
        String(c.chain_id).toUpperCase() === chainHint.toUpperCase())
  );

  if (!picked && upper === "TRX") {
    picked = chains.find((c) => String(c.chain_id).toUpperCase() === "TRX");
  }
  if (!picked && upper === "LTC") {
    picked = chains.find((c) => String(c.chain_id).toUpperCase() === "LTC");
  }
  if (!picked && upper === "BNB") {
    picked = chains.find((c) => String(c.chain_id).toUpperCase() === "BSC");
  }
  if (!picked) {
    return { ok: false, error: `지원하지 않는 네트워크: ${network}` };
  }
  return { ok: true, token: picked, mergeTokenId: mergeId };
}

async function getWithdrawFee(chain_id, contract) {
  const data = await cwalletSession.postApi("/cctip/v1/chain/token/fee", {
    chain_id,
    contract,
  });
  if (data?.code !== 10000 || !data?.data) {
    return { ok: false, error: data?.msg || "수수료 조회 실패" };
  }
  return { ok: true, fee: data.data };
}

function txLink(txid, coin, network) {
  const c = coin.toUpperCase();
  const net = String(network || "").toLowerCase();
  if (c === "TRX" || net === "trc20") {
    return `https://tronscan.org/#/transaction/${txid}`;
  }
  if (c === "LTC" || net === "ltc") {
    return `https://blockchair.com/litecoin/transaction/${txid}`;
  }
  return `https://bscscan.com/tx/${txid}`;
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(amount)
    .replace(/[^\d.]/g, "")
    .trim();
}

async function swapMarketUsdtToCoin({
  toSymbol,
  fromUsdtAmount,
  toQuantity,
}) {
  const toId = await getMergeTokenId(toSymbol);
  if (!toId) {
    return { success: false, error: `${toSymbol} 스왑 대상 없음` };
  }

  const rate = await cwalletSession.postApi(
    "/cctip/v1/swap/coin/rate/get",
    { from: USDT_MERGE_ID, to: toId }
  );
  if (rate?.code !== 10000 || !rate?.data?.pre_id) {
    return { success: false, error: rate?.msg || "스왑 시세 조회 실패" };
  }

  const fromAmt = formatAmount(fromUsdtAmount);
  if (!fromAmt) return { success: false, error: "스왑 금액 오류" };

  let toAmt = toQuantity;
  if (!toAmt) {
    const r = Number(rate.data.rate);
    toAmt = (Number(fromAmt) * r).toFixed(8);
  }
  toAmt = formatAmount(toAmt);

  const sec = await transactionPreCheck("trade.swap.market", {
    quote_id: rate.data.pre_id,
    from_coin_id: USDT_MERGE_ID,
    to_coin_id: toId,
    from_amount: fromAmt,
    to_amount: toAmt,
  });
  if (!sec.ok) return { success: false, error: sec.error };

  const submit = await cwalletSession.postApi(
    "/cctip/v1/swap/coin/order/submit",
    {
      from: USDT_MERGE_ID,
      to: toId,
      from_quantity: fromAmt,
      to_quantity: toAmt,
      torrance: "0.5",
      pre_id: rate.data.pre_id,
      operation_id: sec.operation_id,
      operation_grant_token: sec.operation_grant_token,
      security_payload_version: sec.security_payload_version,
    }
  );

  if (submit?.code !== 10000) {
    return { success: false, error: submit?.msg || "스왑 실패" };
  }

  const order = submit.data || submit;
  return {
    success: true,
    orderNo: order.order_no || order.orderNo,
    type: order.type,
  };
}

/** 구매자 USDT 예산 → 스왑 시세 기대 수령량 (스왑 수수료 반영) */
async function getSwapQuote(fromUsdtAmount, toSymbol) {
  if (!hasSession()) {
    return { ok: false, error: "Cwallet 세션이 없습니다." };
  }
  const fromAmt = formatAmount(fromUsdtAmount);
  if (!fromAmt) return { ok: false, error: "금액 오류" };

  const toId = await getMergeTokenId(toSymbol);
  if (!toId) return { ok: false, error: `${toSymbol} 스왑 대상 없음` };

  const rate = await cwalletSession.postApi(
    "/cctip/v1/swap/coin/rate/get",
    { from: USDT_MERGE_ID, to: toId }
  );
  if (rate?.code !== 10000 || !rate?.data) {
    return { ok: false, error: rate?.msg || "스왑 시세 조회 실패" };
  }

  const r = Number(rate.data.rate);
  const toFromApi = parseFloat(
    rate.data.to_amount ?? rate.data.to_quantity ?? rate.data.quantity
  );
  const toAmount =
    Number.isFinite(toFromApi) && toFromApi > 0
      ? toFromApi
      : Number(fromAmt) * (Number.isFinite(r) ? r : 0);

  if (!toAmount || toAmount <= 0) {
    return { ok: false, error: "스왑 예상 수량 없음" };
  }

  return {
    ok: true,
    fromAmount: Number(fromAmt),
    toAmount,
    preId: rate.data.pre_id,
  };
}

async function estimateWithdrawFeeCoin(symbol, network) {
  const resolved = await resolveChainToken(symbol, network);
  if (!resolved.ok) return resolved;
  const feeRes = await getWithdrawFee(
    resolved.token.chain_id,
    resolved.token.contract
  );
  if (!feeRes.ok) return { ok: false, error: feeRes.error };
  const fee = parseFloat(feeRes.fee.risk_value) || 0;
  return { ok: true, fee };
}

async function withdrawOnChain({
  token,
  amount,
  address,
  memo = "",
}) {
  const value = formatAmount(amount);
  if (!value) return { success: false, error: "송금 수량 오류" };

  const feeRes = await getWithdrawFee(token.chain_id, token.contract);
  if (!feeRes.ok) return { success: false, error: feeRes.error };
  const fee = feeRes.fee;

  const billRes = await cwalletSession.postApi(
    "/cctip/v1/account/asset/withdraw/new",
    { submit_type: 4 }
  );
  if (billRes?.code !== 10000 || !billRes?.data) {
    return { success: false, error: billRes?.msg || "출금 주문 생성 실패" };
  }
  const bill_id = billRes.data;

  const withdrawPayload = {
    bill_id,
    chain_id: token.chain_id,
    contract: token.contract,
    symbol: token.symbol,
    amount: value,
    fee: fee.risk_value,
    destination: address,
    memo: memo || "",
    submit_type: 4,
  };

  const sec = await transactionPreCheck("wallet.withdraw", withdrawPayload);
  if (!sec.ok) return { success: false, error: sec.error };

  const submit = await cwalletSession.postApi(
    "/cctip/v1/account/asset/withdraw/submit",
    {
      bill_id,
      symbol: token.symbol,
      address: String(address).trim(),
      value,
      timestamp: Date.now(),
      fee: fee.risk_value,
      chain_id: token.chain_id,
      submit_type: 4,
      memo: memo || "",
      contract: token.contract,
      operation_id: sec.operation_id,
      operation_grant_token: sec.operation_grant_token,
      security_payload_version: sec.security_payload_version,
    }
  );

  if (submit?.code !== 10000) {
    return { success: false, error: submit?.msg || "출금 실패" };
  }

  const body = submit.data || {};
  const txid =
    body.txid ||
    body.hash ||
    body.record_id ||
    body.order_no ||
    bill_id;

  return {
    success: true,
    txid: String(txid),
    bill_id,
    network: token.network || token.chain_id,
    share_link: body.txid_url || txLink(txid, token.symbol, token.network),
    fee: parseFloat(fee.risk_value) || 0,
  };
}

/**
 * 구매자가 낸 원화 → 서비스 수수료 제외 USDT 예산만 사용.
 * USDT: 출금 수수료는 수령액에서 차감.
 * 기타: USDT 전량 스왑 → 실제 받은 수량 − 출금 수수료 만큼 전송 (스왑 수수료 구매자 부담).
 */
async function fulfillBuyerSend({ usdtSpend, coin, address, network }) {
  if (!hasSession()) {
    return { success: false, error: "Cwallet 세션이 없습니다." };
  }

  const upper = String(coin).toUpperCase();
  const spend = Number(usdtSpend);
  if (!Number.isFinite(spend) || spend <= 0) {
    return { success: false, error: "USDT 예산 오류" };
  }

  const resolved = await resolveChainToken(upper, network);
  if (!resolved.ok) return { success: false, error: resolved.error };

  const feeRes = await getWithdrawFee(
    resolved.token.chain_id,
    resolved.token.contract
  );
  if (!feeRes.ok) return { success: false, error: feeRes.error };
  const withdrawFee = parseFloat(feeRes.fee.risk_value) || 0;

  const balances = await getAllBalances();
  const usdtBal = balances.USDT || 0;
  if (usdtBal < spend) {
    return {
      success: false,
      error: `USDT 재고 부족 (${usdtBal.toFixed(2)} < ${spend.toFixed(6)})`,
    };
  }

  if (upper === "USDT" && spend < exchange.MIN_COIN.USDT) {
    return { success: false, error: `최소 ${exchange.MIN_COIN.USDT} USDT` };
  }

  let sendQty;

  if (upper === "USDT") {
    sendQty = spend - withdrawFee;
    if (sendQty <= 0) {
      return {
        success: false,
        error: "송금액이 출금 수수료보다 작습니다.",
      };
    }
  } else {
    const before = balances[upper] || 0;

    const swap = await swapMarketUsdtToCoin({
      toSymbol: upper,
      fromUsdtAmount: spend.toFixed(6),
      toQuantity: null,
    });
    if (!swap.success) {
      return { success: false, error: swap.error || "스왑 실패" };
    }

    await new Promise((r) => setTimeout(r, 2500));
    const after = (await getAllBalances())[upper] || 0;
    const gained = after - before;
    if (gained <= 0) {
      return {
        success: false,
        error: "스왑 후 코인 수량을 확인하지 못했습니다.",
      };
    }

    sendQty = gained - withdrawFee;
    if (sendQty <= 0) {
      return {
        success: false,
        error: "스왑 결과가 출금 수수료보다 작습니다.",
      };
    }
  }

  const minCoin = exchange.MIN_COIN[upper] ?? 0;
  if (sendQty < minCoin) {
    return {
      success: false,
      error: `최소 송금 미달 (${minCoin} ${upper})`,
    };
  }

  const send = await withdrawOnChain({
    token: resolved.token,
    amount: sendQty,
    address,
  });
  if (!send.success) return send;

  return {
    success: true,
    txid: send.txid,
    network: send.network,
    coin: upper,
    to_address: address,
    share_link: send.share_link,
    fee: send.fee,
    amount_sent: sendQty,
    usdt_spend: spend,
  };
}

module.exports = {
  hasSession,
  getAllBalances,
  fulfillBuyerSend,
  getSwapQuote,
  estimateWithdrawFeeCoin,
  swapMarketUsdtToCoin,
};