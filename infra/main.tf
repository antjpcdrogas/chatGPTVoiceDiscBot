terraform {
  backend "azurerm" {
    resource_group_name  = "discBotGPT"
    storage_account_name = "storagedisbotgptvoice"
    container_name       = "terraformbackend"
    key                  = "terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_storage_account" "storageaccount" {
  name                     = "storagedisbotgptvoice"
  resource_group_name      = azurerm_resource_group.discBotGPT.name
  location                 = azurerm_resource_group.discBotGPT.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = {
    environment = "staging"
  }
}

resource "azurerm_storage_container" "terraformbackend" {
  name                  = "terraformbackend"
  storage_account_name  = azurerm_storage_account.storageaccount.name
  container_access_type = "private"
}



resource "azurerm_resource_group" "discBotGPT" {
  name     = "discBotGPT"
  location = "West Europe"
}

resource "azurerm_virtual_network" "myVnet" {
  name                = "myVnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.discBotGPT.location
  resource_group_name = azurerm_resource_group.discBotGPT.name
}


resource "azurerm_subnet" "mySubnet" {
  name                 = "mySubnet"
  resource_group_name  = azurerm_resource_group.discBotGPT.name
  virtual_network_name = azurerm_virtual_network.myVnet.name
  address_prefixes     = ["10.0.1.0/24"]
}


# Create a network interface with public address

resource "azurerm_network_interface" "myNic" {
  name                = "myNic"
  location            = azurerm_resource_group.discBotGPT.location
  resource_group_name = azurerm_resource_group.discBotGPT.name

  ip_configuration {
    name                          = "myNicConfiguration"
    subnet_id                     = azurerm_subnet.mySubnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.myPublicIp.id
  }
}

resource "azurerm_public_ip" "myPublicIp" {
  name                = "myPublicIp"
  location            = azurerm_resource_group.discBotGPT.location
  resource_group_name = azurerm_resource_group.discBotGPT.name
  allocation_method   = "Dynamic"
}





resource "azurerm_linux_virtual_machine" "myVM" {
  name                = "VMDiscbotGPT"
  resource_group_name = azurerm_resource_group.discBotGPT.name
  location            = azurerm_resource_group.discBotGPT.location
  size                = "Standard_B1s"
  admin_username      = "adminuser"
  network_interface_ids = [
    azurerm_network_interface.myNic.id,
  ]

  admin_ssh_key {
    username   = "adminuser"
    public_key = file("VMPriv.pem.pub")
    

  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "UbuntuServer"
    sku       = "20.04-LTS"
    version   = "latest"
  }
}



output "public_ip_address" {
  value = azurerm_public_ip.myPublicIp.ip_address
}
