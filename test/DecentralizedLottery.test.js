const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DecentralizedLottery", function () {
  const TICKET_PRICE = ethers.parseEther("0.01");
  const GAS_LANE = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const CALLBACK_GAS_LIMIT = 500_000;
  const BASE_FEE = ethers.parseEther("0.1");
  const GAS_PRICE_LINK = 1_000_000_000n;

  async function deployFixture() {
    const [owner, player1, player2, player3] = await ethers.getSigners();

    const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    const vrfMock = await VRFMock.deploy(BASE_FEE, GAS_PRICE_LINK);

    const subTx = await vrfMock.createSubscription();
    const subReceipt = await subTx.wait();
    const subId = subReceipt.logs[0].args[0];

    await vrfMock.fundSubscription(subId, ethers.parseEther("10"));

    const Lottery = await ethers.getContractFactory("DecentralizedLottery");
    const lottery = await Lottery.deploy(vrfMock.target, subId, GAS_LANE, CALLBACK_GAS_LIMIT);

    await vrfMock.addConsumer(subId, lottery.target);

    return { lottery, vrfMock, owner, player1, player2, player3 };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function getRequestId(tx) {
    const receipt = await tx.wait();
    const ev = receipt.logs.find((l) => l.fragment?.name === "DrawRequested");
    return ev.args[0];
  }

  // ── Deployment ───────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("starts OPEN at round 1", async function () {
      const { lottery } = await loadFixture(deployFixture);
      expect(await lottery.getLotteryState()).to.equal(0);
      expect(await lottery.s_lotteryId()).to.equal(1n);
    });

    it("returns correct config constants", async function () {
      const { lottery } = await loadFixture(deployFixture);
      const [price, max, prize, fee] = await lottery.getConfig();
      expect(price).to.equal(TICKET_PRICE);
      expect(max).to.equal(10n);
      expect(prize).to.equal(90n);
      expect(fee).to.equal(10n);
    });
  });

  // ── buyTickets ────────────────────────────────────────────────────────────

  describe("buyTickets", function () {
    it("records player and increases pool", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE });
      expect(await lottery.getPlayerTickets(player1.address)).to.equal(1n);
      expect(await lottery.getPrizePool()).to.equal(TICKET_PRICE);
    });

    it("allows up to 10 tickets across multiple buys", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.connect(player1).buyTickets(5, { value: TICKET_PRICE * 5n });
      await lottery.connect(player1).buyTickets(5, { value: TICKET_PRICE * 5n });
      expect(await lottery.getPlayerTickets(player1.address)).to.equal(10n);
    });

    it("reverts on wrong ETH amount", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await expect(
        lottery.connect(player1).buyTickets(1, { value: ethers.parseEther("0.005") })
      ).to.be.revertedWith("Lottery: wrong ETH amount");
    });

    it("reverts when ticket limit exceeded", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.connect(player1).buyTickets(10, { value: TICKET_PRICE * 10n });
      await expect(
        lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE })
      ).to.be.revertedWith("Lottery: exceeds ticket limit");
    });

    it("reverts while CALCULATING", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE });
      await lottery.requestDraw();
      await expect(
        lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE })
      ).to.be.revertedWith("Lottery: not open");
    });

    it("emits TicketsPurchased", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await expect(lottery.connect(player1).buyTickets(2, { value: TICKET_PRICE * 2n }))
        .to.emit(lottery, "TicketsPurchased")
        .withArgs(player1.address, 2n, TICKET_PRICE * 2n);
    });
  });

  // ── requestDraw ───────────────────────────────────────────────────────────

  describe("requestDraw", function () {
    it("only owner can call", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE });
      await expect(lottery.connect(player1).requestDraw()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("reverts with no participants", async function () {
      const { lottery } = await loadFixture(deployFixture);
      await expect(lottery.requestDraw()).to.be.revertedWith("Lottery: no participants");
    });

    it("transitions to CALCULATING and emits DrawRequested", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE });
      await expect(lottery.requestDraw()).to.emit(lottery, "DrawRequested");
      expect(await lottery.getLotteryState()).to.equal(1);
    });
  });

  // ── fulfillRandomWords ────────────────────────────────────────────────────

  describe("VRF fulfillment", function () {
    async function setupAndDraw(fixture) {
      const { lottery, vrfMock, player1, player2, player3 } = fixture;
      await lottery.connect(player1).buyTickets(2, { value: TICKET_PRICE * 2n });
      await lottery.connect(player2).buyTickets(3, { value: TICKET_PRICE * 3n });
      await lottery.connect(player3).buyTickets(1, { value: TICKET_PRICE });
      const requestId = await getRequestId(await lottery.requestDraw());
      return { requestId, pool: await lottery.getPrizePool() };
    }

    it("pays 90% prize to winner and resets state", async function () {
      const fixture = await loadFixture(deployFixture);
      const { lottery, vrfMock, player1, player2, player3 } = fixture;
      const { requestId, pool } = await setupAndDraw(fixture);

      const balances = await Promise.all(
        [player1, player2, player3].map((p) => ethers.provider.getBalance(p.address))
      );

      await vrfMock.fulfillRandomWords(requestId, lottery.target);

      expect(await lottery.getLotteryState()).to.equal(0);
      expect(await lottery.s_lotteryId()).to.equal(2n);

      const expectedPrize = (pool * 90n) / 100n;
      const expectedFee   = (pool * 10n) / 100n;
      expect(await lottery.getAccumulatedFees()).to.equal(expectedFee);

      const after = await Promise.all(
        [player1, player2, player3].map((p) => ethers.provider.getBalance(p.address))
      );
      const gains = after.map((a, i) => a - balances[i]).filter((g) => g > 0n);
      expect(gains.length).to.equal(1);
      expect(gains[0]).to.equal(expectedPrize);
    });

    it("records draw in history", async function () {
      const fixture = await loadFixture(deployFixture);
      const { lottery, vrfMock } = fixture;
      const { requestId } = await setupAndDraw(fixture);
      await vrfMock.fulfillRandomWords(requestId, lottery.target);

      expect(await lottery.getDrawHistoryCount()).to.equal(1n);
      const [result] = await lottery.getDrawHistory();
      expect(result.lotteryId).to.equal(1n);
      expect(result.uniquePlayers).to.equal(3n);
      expect(result.totalTickets).to.equal(6n);
    });

    it("resets player ticket counts after draw", async function () {
      const fixture = await loadFixture(deployFixture);
      const { lottery, vrfMock, player1 } = fixture;
      const { requestId } = await setupAndDraw(fixture);
      await vrfMock.fulfillRandomWords(requestId, lottery.target);
      expect(await lottery.getPlayerTickets(player1.address)).to.equal(0n);
    });
  });

  // ── withdrawFees ──────────────────────────────────────────────────────────

  describe("withdrawFees", function () {
    it("transfers accumulated fees to owner", async function () {
      const fixture = await loadFixture(deployFixture);
      const { lottery, vrfMock, owner, player1 } = fixture;
      await lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE });
      const requestId = await getRequestId(await lottery.requestDraw());
      await vrfMock.fulfillRandomWords(requestId, lottery.target);

      const fees = await lottery.getAccumulatedFees();
      expect(fees).to.be.gt(0n);

      const before = await ethers.provider.getBalance(owner.address);
      const tx = await lottery.withdrawFees();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);

      expect(after).to.equal(before + fees - gasCost);
      expect(await lottery.getAccumulatedFees()).to.equal(0n);
    });

    it("reverts when no fees", async function () {
      const { lottery } = await loadFixture(deployFixture);
      await expect(lottery.withdrawFees()).to.be.revertedWith("Lottery: no fees");
    });
  });

  // ── pause / unpause ───────────────────────────────────────────────────────

  describe("pause / unpause", function () {
    it("blocks buyTickets while paused", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.pause();
      await expect(
        lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE })
      ).to.be.revertedWith("Pausable: paused");
    });

    it("resumes after unpause", async function () {
      const { lottery, player1 } = await loadFixture(deployFixture);
      await lottery.pause();
      await lottery.unpause();
      await lottery.connect(player1).buyTickets(1, { value: TICKET_PRICE });
      expect(await lottery.getPlayerTickets(player1.address)).to.equal(1n);
    });
  });
});
