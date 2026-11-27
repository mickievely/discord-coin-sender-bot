const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const config = require("../config");
const db = require("../db");
const exchange = require("../services/exchange");
const cwallet = require("../services/cwallet");
const { getServiceFeeRate } = require("../services/fees");
const { pendingTx } = require("../state/pending");
const {
  ackInteractionForEdit,
  buildV2Payload,
  updateV2,
} = require("../ui/v2");
const verifyHandler = require("./verify");

async function ephemeralV2(interaction, options) {
  const payload = buildV2Payload(options);
  await ackInteractionForEdit(interaction);
  return interaction.editReply(payload);
}

const COIN_OPTS = [
  { label: "USDT", value: "usdt" },
  { label: "TRX", value: "trx" },
  { label: "LTC", value: "ltc" },
  { label: "BNB", value: "bnb" },
];

const NETWORK_OPTS = {
  usdt: [
    { label: "BEP20", value: "bep20" },
    { label: "TRC20", value: "trc20" },
  ],
  trx: [{ label: "TRC20", value: "trc20" }],
  ltc: [{ label: "LTC", value: "ltc" }],
  bnb: [{ label: "BEP20", value: "bep20" }],
};

function requireVerified(interaction) {
  return Boolean(db.getVerifiedUser(interaction.user.id));
}

async function showVerifyRequired(interaction) {
  return ephemeralV2(interaction, {
    showFooter: false,
    lines: ["**본인인증이 필요합니다**"],
    buttons: [
      {
        id: "start_verify",
        label: "본인인증",
        style: ButtonStyle.Danger,
        emojiKey: "start_verify",
      },
    ],
  });
}

async function handleButton(interaction, client) {
  const id = interaction.customId;

  if (
    id === "start_verify" ||
    id.startsWith("verify_")
  ) {
  const handled = await verifyHandler.routeVerifyButton(interaction, id);
    if (handled !== false) return handled;
  }

  const needsVerify = [
    "svc_use",
    "svc_purchase",
    "svc_info",
    "svc_charge",
    "svc_minimum",
    "send_coin",
  ];
  if (needsVerify.includes(id) && !requireVerified(interaction)) {
    return showVerifyRequired(interaction);
  }

  if (id === "svc_use") {
    return ephemeralV2(interaction, {
      lines: ["**대행 이용**", "송금할 코인을 선택하세요."],
      selects: [
        {
          id: "coin_select",
          placeholder: "코인 선택",
          options: COIN_OPTS,
        },
      ],
    });
  }

  if (id === "svc_purchase") {
    return ephemeralV2(interaction, {
      lines: ["**코인 매입**", "매입할 코인을 선택하세요."],
      selects: [
        {
          id: "purchase_select",
          placeholder: "코인 선택",
          options: COIN_OPTS,
        },
      ],
    });
  }

  if (id === "svc_info") {
    const u = db.getVerifiedUser(interaction.user.id);
    return ephemeralV2(interaction, {
      lines: [
        `**${interaction.user.displayName}** · ${u.name || "고객"}`,
        `보유: ₩${(u.now_amount || 0).toLocaleString("ko-KR")}`,
        `누적: ₩${(u.Total_amount || 0).toLocaleString("ko-KR")}`,
      ],
      buttons: [
        {
          id: "view_history",
          label: "거래내역",
          style: ButtonStyle.Primary,
          emojiKey: "view_history",
        },
      ],
    });
  }

  if (id === "svc_charge") {
    const modal = new ModalBuilder()
      .setCustomId("charge_modal")
      .setTitle("충전 금액");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("charge_amount")
          .setLabel("충전 금액 (원)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(12)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (id === "svc_minimum") {
    const mins = await exchange.getMinimumAmountsKrw();
    const body = exchange.SUPPORTED.map(
      (c) => `**${c}** · 최소 ₩${(mins[c] || 0).toLocaleString("ko-KR")}`
    ).join("\n");
    return ephemeralV2(interaction, {
      lines: ["**최소 송금 안내**", body],
    });
  }

  if (id === "view_history") {
    const txs = db.getTransactionHistory(interaction.user.id, 10);
    const lines = txs.map(
      (t, i) =>
        `${i + 1}. ${t.type} ₩${t.amount.toLocaleString("ko-KR")} ${t.coin_type || ""}`
    );
    return ephemeralV2(interaction, {
      lines: lines.length ? lines : ["거래내역이 없습니다."],
    });
  }

  if (id === "send_coin") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    await interaction.editReply(
      buildV2Payload({ lines: ["**송금 처리 중…**", "잠시만 기다려 주세요."] })
    );

    const data = pendingTx.get(interaction.user.id);
    if (!data) {
      return interaction.editReply(
        buildV2Payload({ lines: ["세션 만료. 다시 시도해 주세요."] })
      );
    }

    if (!db.subtractBalance(interaction.user.id, data.krwAmount)) {
      return interaction.editReply(
        buildV2Payload({ lines: ["잔액 부족"] })
      );
    }

    const result = await cwallet.fulfillBuyerSend({
      usdtSpend: data.usdtSpend,
      coin: data.coin,
      address: data.address,
      network: data.network,
    });

    pendingTx.delete(interaction.user.id);

    if (!result.success) {
      db.addBalance(interaction.user.id, data.krwAmount, "환불");
      return interaction.editReply(
        buildV2Payload({
          lines: ["**송금 실패**", result.error, "금액이 환불되었습니다."],
        })
      );
    }

    db.addTransactionHistory(interaction.user.id, data.krwAmount, "송금", {
      txid: result.txid,
      coinType: result.coin,
      address: data.address,
      fee: Math.round(data.totalFeeKrw),
    });

    return interaction.editReply(
      buildV2Payload({
        lines: [
          `**${result.coin} 송금 성공**`,
          result.amount_sent != null
            ? `수령 수량: **${Number(result.amount_sent).toFixed(6)} ${result.coin}**`
            : null,
          `TXID: \`${result.txid}\``,
          `링크: ${result.share_link}`,
        ].filter(Boolean),
      })
    );
  }

  return null;
}

async function handleSelect(interaction) {
  const id = interaction.customId;

  const verifyHandled = await verifyHandler.routeVerifySelect(interaction);
  if (verifyHandled !== false) return verifyHandled;

  if (id === "purchase_select") {
    const coin = interaction.values[0].toUpperCase();
    const addr = config.coinAddresses[coin] || "주소 미설정";
    return updateV2(interaction, {
      lines: [
        `**${coin} 매입**`,
        "아래 주소로 입금해 주세요.",
        `\`\`\`${addr}\`\`\``,
      ],
    });
  }

  if (id === "coin_select") {
    const coin = interaction.values[0];
    const nets = NETWORK_OPTS[coin] || NETWORK_OPTS.usdt;
    return updateV2(interaction, {
      lines: [`**${coin.toUpperCase()} 송금**`, "네트워크를 선택하세요."],
      selects: [
        {
          id: `network_select_${coin}`,
          placeholder: "네트워크",
          options: nets,
        },
      ],
    });
  }

  if (id.startsWith("network_select_")) {
    const coin = id.replace("network_select_", "");
    const network = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`amount_modal_${network}_${coin}`)
      .setTitle(`${coin.toUpperCase()} 송금`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("원화 금액")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("address")
          .setLabel("지갑 주소")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  return null;
}

async function handleModal(interaction, client) {
  if (interaction.customId === "verify_info_modal") {
    return verifyHandler.onInfoModal(interaction);
  }
  if (interaction.customId === "verify_code_modal") {
    return verifyHandler.onCodeModal(interaction, client);
  }

  if (interaction.customId === "charge_modal") {
    await interaction.deferReply({ ephemeral: true });
    const raw = interaction.fields.getTextInputValue("charge_amount");
    const amount = parseInt(raw.replace(/[^\d]/g, ""), 10);
    if (!amount || amount < 500) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({
          lines: ["최소 충전 금액은 500원입니다."],
        })
      );
    }
    return interaction.editReply(
      require("../ui/v2").buildV2Payload({
        lines: [
          `**충전 안내** · ₩${amount.toLocaleString("ko-KR")}`,
          `\`\`\`${config.depositBankName} ${config.depositAccountNo}`,
          `예금주: ${config.depositAccountHolder}\`\`\``,
          "입금 후 DM으로 영수증을 보내 주세요.",
        ],
      })
    );
  }

  if (interaction.customId.startsWith("amount_modal_")) {
    await interaction.deferReply({ ephemeral: true });
    const parts = interaction.customId.split("_");
    const coin = parts[parts.length - 1];
    const network = parts[parts.length - 2];
    const krw = parseFloat(
      interaction.fields.getTextInputValue("amount").replace(/[^\d.]/g, "")
    );
    const address = interaction.fields.getTextInputValue("address").trim();

    if (!krw || !address) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({ lines: ["입력값을 확인해 주세요."] })
      );
    }

    const mins = await exchange.getMinimumAmountsKrw();
    const minKrw = mins[coin.toUpperCase()] || 10000;
    if (krw < minKrw) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({
          lines: [`최소 ₩${minKrw.toLocaleString("ko-KR")}`],
        })
      );
    }

    const user = db.getVerifiedUser(interaction.user.id);
    if (!user || user.now_amount < krw) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({ lines: ["잔액 부족"] })
      );
    }

    const krwRate = await exchange.getExchangeRate();
    const kimchi = await exchange.getKimchiPremium();
    const actualRate = krwRate * (1 + kimchi / 100);
    const coinPrice = await exchange.getCoinPrice(coin);
    const feeRate = getServiceFeeRate() + kimchi / 100;
    const serviceFeeKrw = krw * feeRate;
    const sendKrw = krw - serviceFeeKrw;
    const usdtSpend = sendKrw / actualRate;
    const upper = coin.toUpperCase();

    let chainFeeCoin = exchange.getTransactionFee(upper, network);
    if (cwallet.hasSession()) {
      const liveFee = await cwallet.estimateWithdrawFeeCoin(upper, network);
      if (liveFee.ok) chainFeeCoin = liveFee.fee;
    }

    let sendAmount;
    if (upper === "USDT") {
      sendAmount = usdtSpend - chainFeeCoin;
    } else {
      let swapOut = coinPrice > 0 ? usdtSpend / coinPrice : 0;
      if (cwallet.hasSession()) {
        const quote = await cwallet.getSwapQuote(usdtSpend, upper);
        if (quote.ok) swapOut = quote.toAmount;
      }
      sendAmount = swapOut - chainFeeCoin;
    }

    const minCoin = exchange.MIN_COIN[upper] ?? 0;
    if (!sendAmount || sendAmount < minCoin) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({
          lines: [
            "스왑·송금 수수료 반영 후 최소 송금액 미달입니다.",
            `최소 약 ${minCoin} ${upper} (또는 원화 최소 금액 상향)`,
          ],
        })
      );
    }

    if (upper === "USDT" && usdtSpend < exchange.MIN_COIN.USDT) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({
          lines: [`USDT 사용액 최소 ${exchange.MIN_COIN.USDT} (원화 금액을 올려 주세요).`],
        })
      );
    }

    pendingTx.set(interaction.user.id, {
      coin: upper,
      network,
      address,
      krwAmount: Math.floor(krw),
      usdtSpend,
      sendAmount,
      serviceFeeKrw,
      totalFeeKrw: serviceFeeKrw,
    });

    return interaction.editReply(
      require("../ui/v2").buildV2Payload({
        lines: [
          `**${upper} 송금 준비**`,
          `차감: ₩${Math.floor(krw).toLocaleString("ko-KR")}`,
          `USDT 사용 예정: **${usdtSpend.toFixed(4)}** (재고에서 스왑·출금)`,
          `예상 수령: **${sendAmount.toFixed(6)} ${upper}**`,
          "스왑·네트워크 수수료는 예상 수령량에 반영됩니다.",
          `서비스 수수료: ₩${Math.floor(serviceFeeKrw).toLocaleString("ko-KR")}`,
          `주소: \`${address}\``,
        ],
        buttons: [
          {
            id: "send_coin",
            label: "송금하기",
            style: ButtonStyle.Danger,
            emojiKey: "send_coin",
          },
        ],
      })
    );
  }

  return null;
}

module.exports = { handleButton, handleSelect, handleModal };