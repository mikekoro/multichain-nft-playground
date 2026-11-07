// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Playground1155 is ERC1155URIStorage, Ownable {
    uint256 public nextId;
    constructor() ERC1155("") Ownable(msg.sender) {}
    function mint(address to, uint256 amount, string calldata uri_) external onlyOwner returns (uint256 id) {
        id = nextId++;
        _mint(to, id, amount, "");
        _setURI(id, uri_);
    }
}
