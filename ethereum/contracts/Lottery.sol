// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract LotteryGenerator {

    address[] public lotteries;

    struct lottery {
        uint index;
        address manager;
    }

    mapping(address => lottery) lotteryStructs;

    function createLottery(string memory name) public {
        require(bytes(name).length > 0);
        address newLottery = address(new Lottery(name, msg.sender));
        lotteries.push(newLottery);
        lotteryStructs[newLottery].index = lotteries.length - 1;
        lotteryStructs[newLottery].manager = msg.sender;

        emit LotteryCreated(newLottery);
    }

    function getLotteries() public view returns ( address[] memory){
        return lotteries;
    }


    function deleteLottery(address lotteryAddress) public {
        require(msg.sender == lotteryStructs[lotteryAddress].manager);
        uint indexToDelete = lotteryStructs[lotteryAddress].index;
        address lastAddress = lotteries[lotteries.length - 1];
        lotteries[indexToDelete] = lastAddress;
        lotteries.pop();
    }

    // Events
    event LotteryCreated(
        address lotteryAddress
    );
}

contract Lottery {
    string public lotteryName;
    address public manager;

    struct Player {
        string name;
        uint entryCount;
        uint index;
    }

    address[] public addressIndexes;
    mapping(address => Player) players;
    address[] public lotteryBag;

    Player public winner;
    bool public isLotteryLive;
    uint public maxEntriesForPlayer;
    uint public ethToParticipate;

    constructor( string memory name, address creator) {
        manager = creator;
        lotteryName = name;
    }


    fallback() payable external {}

    receive() payable external {
        participate("Unknown");
    }

    function participate(string memory playerName) public payable {
        require(bytes(playerName).length > 0);
        require(isLotteryLive);
        require(msg.value == ethToParticipate * 1 ether);
        require(players[msg.sender].entryCount < maxEntriesForPlayer);

        if (isNewPlayer(msg.sender)) {
            addressIndexes.push(msg.sender);
            players[msg.sender].entryCount = 1;
            players[msg.sender].name = playerName;
            players[msg.sender].index = addressIndexes.length - 1;
        } else {
            players[msg.sender].entryCount += 1;
        }

        lotteryBag.push(msg.sender);

        // event
        emit PlayerParticipated(players[msg.sender].name, players[msg.sender].entryCount);
    }

    function activateLottery(uint maxEntries, uint ethRequired) public restricted {
        isLotteryLive = true;
        maxEntriesForPlayer = maxEntries == 0 ? 1 : maxEntries;
        ethToParticipate = ethRequired == 0 ? 1 : ethRequired;
    }

    function declareWinner() public restricted {
        require(lotteryBag.length > 0);

        uint index = generateRandomNumber() % lotteryBag.length;
        payable(lotteryBag[index]).transfer(address(this).balance);

        winner.name = players[lotteryBag[index]].name;
        winner.entryCount = players[lotteryBag[index]].entryCount;

        lotteryBag = new address[](0);
        addressIndexes = new address[](0);
        isLotteryLive = false;

        emit WinnerDeclared(winner.name, winner.entryCount);
    }

    function getPlayers() public view returns ( address[] memory){
        return addressIndexes;
    }

    function getPlayer(address playerAddress) public view returns (string memory, uint){
        if (isNewPlayer(playerAddress)) {
            return ("", 0);
        }

        return (players[playerAddress].name, players[playerAddress].entryCount);
    }

    function getWinningPrice() public view returns (uint){
        return address(this).balance;
    }

    function isNewPlayer(address playerAddress) private view returns (bool){
        if (addressIndexes.length == 0) {
            return true;
        }

        return (addressIndexes[players[playerAddress].index] != playerAddress);
    }

    function generateRandomNumber() private view returns (uint) {
        return uint(keccak256(abi.encodePacked(block.difficulty, block.timestamp , lotteryBag)));
    }

    modifier restricted(){
        require(msg.sender == manager);
        _;
    }

    // Events
    event WinnerDeclared(string name, uint entryCount);
    event PlayerParticipated(string name, uint entryCount);
}
