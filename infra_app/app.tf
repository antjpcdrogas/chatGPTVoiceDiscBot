terraform {
  backend "azurerm" {
    resource_group_name  = "discBotGPT"
    storage_account_name = "storagedisbotgptvoice"
    container_name       = "terraformbackend"
    key                  = "terraformVM.tfstate"
  }
}

provider "azurerm" {
  features {}
}


# Create a network interface with public address

resource "azurerm_network_interface" "myNic" {
  name                = "myNic"
  location            = var.location
  resource_group_name = var.resource_group_name

  ip_configuration {
    name                          = "myNicConfiguration"
    subnet_id                     = var.subnet_id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.myPublicIp.id
  }
}

resource "azurerm_public_ip" "myPublicIp" {
  name                = "myPublicIp"
  location            = var.location
  resource_group_name = var.resource_group_name
  allocation_method   = "Dynamic"
}

#Create FQDN
resource "azurerm_dns_zone" "dnszone" {
  name                = "discbotgpt.com"
  resource_group_name = var.resource_group_name
}
resource "azurerm_dns_a_record" "myFQDN" {
  name                = "discbotgpt"
  zone_name           = azurerm_dns_zone.dnszone.name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  target_resource_id  = azurerm_public_ip.myPublicIp.id
}
resource "azurerm_dns_cname_record" "example" {
  name                = "discBotGPT"
  zone_name           = azurerm_dns_zone.dnszone.name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  target_resource_id  = azurerm_public_ip.myPublicIp.id
}

resource "azurerm_linux_virtual_machine" "myVM" {
  name                = "VMDiscbotGPT"
  location            = var.location
  resource_group_name = var.resource_group_name
  size                = "Standard_B1s"
  admin_username      = "adminuser"
  dns
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
    sku       = "18.04-LTS"
    version   = "latest"
  }
}

output "public_ip_address" {
  value = azurerm_public_ip.myPublicIp.ip_address
}

#create var with resource group name and location
variable "resource_group_name" {
  type = string
  default = "discBotGPT"
}
variable "location" {
  type = string
  default = "West Europe"
}

variable "subnet_id" {
  type = string
  default = "/subscriptions/a1dac0b3-167a-44d8-b506-b590072031f7/resourceGroups/discBotGPT/providers/Microsoft.Network/virtualNetworks/myVnet/subnets/mySubnet"
}