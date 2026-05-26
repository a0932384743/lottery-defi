// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

/**
 * @title DecentralizedLottery
 * @notice Fair on-chain lottery using Chainlink VRF v2.
 *
 * - Players buy tickets at TICKET_PRICE each (max MAX_TICKETS_PER_PLAYER per round).
 * - More tickets = higher winning probability (weighted selection).
 * - Owner calls requestDraw() → Chainlink VRF callback picks winner.
 * - PRIZE_PERCENTAGE goes to winner; FEE_PERCENTAGE accrues for owner withdrawal.
 */
contract DecentralizedLottery is VRFConsumerBaseV2, ReentrancyGuard, Ownable, Pausable {

    /* ─────────────────────────── Chainlink VRF ───────────────────────────── */

    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint64  private immutable i_subscriptionId;
    bytes32 private immutable i_gasLane;
    uint32  private immutable i_callbackGasLimit;
    uint16  private constant  REQUEST_CONFIRMATIONS = 3;
    uint32  private constant  NUM_WORDS = 1;

    /* ─────────────────────────── Lottery Config ──────────────────────────── */

    uint256 public constant TICKET_PRICE           = 0.01 ether;
    uint256 public constant MAX_TICKETS_PER_PLAYER = 10;
    uint256 public constant PRIZE_PERCENTAGE       = 90;
    uint256 public constant FEE_PERCENTAGE         = 10;

    /* ─────────────────────────── State ───────────────────────────────────── */

    enum LotteryState { OPEN, CALCULATING }

    LotteryState private s_lotteryState;
    uint256      public  s_lotteryId;

    // One slot per ticket so winner selection is probability-weighted
    address[] private s_ticketEntries;
    // Separate unique-player list enables O(n) reset without a second mapping pass
    address[] private s_uniquePlayers;
    mapping(address => uint256) private s_ticketCount;
    mapping(address => bool)    private s_isPlayer;

    uint256 private s_pendingRequestId;
    // Fees from completed rounds held inside the contract until owner withdraws
    uint256 private s_accumulatedFees;

    /* ─────────────────────────── History ─────────────────────────────────── */

    struct DrawResult {
        uint256 lotteryId;
        address winner;
        uint256 prize;
        uint256 timestamp;
        uint256 uniquePlayers;
        uint256 totalTickets;
    }
    DrawResult[] private s_drawHistory;

    /* ─────────────────────────── Events ──────────────────────────────────── */

    event TicketsPurchased(address indexed player, uint256 numTickets, uint256 poolSize);
    event DrawRequested(uint256 indexed requestId, uint256 indexed lotteryId);
    event WinnerPicked(
        uint256 indexed lotteryId,
        address indexed winner,
        uint256 prize,
        uint256 fee
    );
    event FeesWithdrawn(address indexed to, uint256 amount);
    event LotteryReset(uint256 indexed newLotteryId);

    /* ─────────────────────────── Constructor ─────────────────────────────── */

    constructor(
        address vrfCoordinatorV2,
        uint64  subscriptionId,
        bytes32 gasLane,
        uint32  callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_vrfCoordinator   = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_subscriptionId   = subscriptionId;
        i_gasLane          = gasLane;
        i_callbackGasLimit = callbackGasLimit;
        s_lotteryState     = LotteryState.OPEN;
        s_lotteryId        = 1;
    }

    /* ─────────────────────────── Player ──────────────────────────────────── */

    /**
     * @notice Purchase tickets for the current round.
     * @param numberOfTickets 1 – MAX_TICKETS_PER_PLAYER
     */
    function buyTickets(uint256 numberOfTickets) external payable nonReentrant whenNotPaused {
        require(s_lotteryState == LotteryState.OPEN,                           "Lottery: not open");
        require(numberOfTickets > 0,                                            "Lottery: zero tickets");
        require(msg.value == TICKET_PRICE * numberOfTickets,                   "Lottery: wrong ETH amount");
        require(
            s_ticketCount[msg.sender] + numberOfTickets <= MAX_TICKETS_PER_PLAYER,
            "Lottery: exceeds ticket limit"
        );

        if (!s_isPlayer[msg.sender]) {
            s_uniquePlayers.push(msg.sender);
            s_isPlayer[msg.sender] = true;
        }
        s_ticketCount[msg.sender] += numberOfTickets;
        for (uint256 i; i < numberOfTickets; ++i) {
            s_ticketEntries.push(msg.sender);
        }

        emit TicketsPurchased(msg.sender, numberOfTickets, address(this).balance - s_accumulatedFees);
    }

    /* ─────────────────────────── Admin ───────────────────────────────────── */

    /**
     * @notice Request Chainlink VRF randomness to pick a winner.
     *         Only callable by the owner when the lottery is OPEN.
     */
    function requestDraw() external onlyOwner whenNotPaused {
        require(s_lotteryState == LotteryState.OPEN,  "Lottery: already drawing");
        require(s_ticketEntries.length > 0,           "Lottery: no participants");

        s_lotteryState = LotteryState.CALCULATING;

        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        s_pendingRequestId = requestId;
        emit DrawRequested(requestId, s_lotteryId);
    }

    /**
     * @notice Chainlink VRF callback. Picks winner and distributes prize.
     *         Called by the VRF coordinator — never call directly.
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal override {
        require(requestId == s_pendingRequestId,             "Lottery: unknown request");
        require(s_lotteryState == LotteryState.CALCULATING,  "Lottery: wrong state");

        uint256 winnerIdx = randomWords[0] % s_ticketEntries.length;
        address winner    = s_ticketEntries[winnerIdx];

        uint256 prizePool = address(this).balance - s_accumulatedFees;
        uint256 fee       = (prizePool * FEE_PERCENTAGE) / 100;
        uint256 prize     = prizePool - fee;

        // Snapshot before state reset
        uint256 currentId   = s_lotteryId;
        uint256 playerCount = s_uniquePlayers.length;
        uint256 ticketCount = s_ticketEntries.length;

        // CEI pattern: update state before external call
        _resetRound();
        s_accumulatedFees += fee;

        s_drawHistory.push(DrawResult({
            lotteryId:     currentId,
            winner:        winner,
            prize:         prize,
            timestamp:     block.timestamp,
            uniquePlayers: playerCount,
            totalTickets:  ticketCount
        }));

        (bool sent, ) = payable(winner).call{value: prize}("");
        require(sent, "Lottery: prize transfer failed");

        emit WinnerPicked(currentId, winner, prize, fee);
    }

    /**
     * @notice Withdraw accumulated operator fees to the owner wallet.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = s_accumulatedFees;
        require(amount > 0, "Lottery: no fees");
        s_accumulatedFees = 0;
        (bool sent, ) = payable(owner()).call{value: amount}("");
        require(sent, "Lottery: fee transfer failed");
        emit FeesWithdrawn(owner(), amount);
    }

    /// @notice Emergency stop — halts ticket purchases and draws.
    function pause() external onlyOwner { _pause(); }

    /// @notice Resume normal operation.
    function unpause() external onlyOwner { _unpause(); }

    /* ─────────────────────────── Internal ────────────────────────────────── */

    function _resetRound() internal {
        for (uint256 i; i < s_uniquePlayers.length; ++i) {
            address p = s_uniquePlayers[i];
            delete s_ticketCount[p];
            delete s_isPlayer[p];
        }
        delete s_ticketEntries;
        delete s_uniquePlayers;
        s_lotteryState     = LotteryState.OPEN;
        s_pendingRequestId = 0;
        s_lotteryId       += 1;
        emit LotteryReset(s_lotteryId);
    }

    /* ─────────────────────────── View / Pure ─────────────────────────────── */

    function getLotteryState()     external view returns (LotteryState)       { return s_lotteryState; }
    function getPrizePool()        external view returns (uint256)            { return address(this).balance - s_accumulatedFees; }
    function getTicketEntries()    external view returns (address[] memory)   { return s_ticketEntries; }
    function getUniquePlayers()    external view returns (address[] memory)   { return s_uniquePlayers; }
    function getPlayerTickets(address p) external view returns (uint256)      { return s_ticketCount[p]; }
    function getDrawHistory()      external view returns (DrawResult[] memory){ return s_drawHistory; }
    function getDrawHistoryCount() external view returns (uint256)            { return s_drawHistory.length; }
    function getAccumulatedFees()  external view returns (uint256)            { return s_accumulatedFees; }

    function getConfig() external pure returns (
        uint256 ticketPrice,
        uint256 maxTicketsPerPlayer,
        uint256 prizePercentage,
        uint256 feePercentage
    ) {
        return (TICKET_PRICE, MAX_TICKETS_PER_PLAYER, PRIZE_PERCENTAGE, FEE_PERCENTAGE);
    }
}
