provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "myResourceGroup" {
  name     = "myResourceGroup"
  location = "eastus"
}

resource "azurerm_virtual_network" "myVnet" {
  name                = "myVnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.myResourceGroup.location
  resource_group_name = azurerm_resource_group.myResourceGroup.name
}

resource "azurerm_subnet" "mySubnet" {
  name                 = "mySubnet"
  resource_group_name  = azurerm_resource_group.myResourceGroup.name
  virtual_network_name = azurerm_virtual_network.myVnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_network_interface" "myNic" {
  name                = "myNic"
  location            = azurerm_resource_group.myResourceGroup.location
  resource_group_name = azurerm_resource_group.myResourceGroup.name

  ip_configuration {
    name                          = "myNicConfiguration"
    subnet_id                     = azurerm_subnet.mySubnet.id
    private_ip_address_allocation = "Dynamic"
  }
}



resource "azurerm_virtual_machine" "myVM" {
  name                  = "myVM"
  location              = azurerm_resource_group.myResourceGroup.location
  resource_group_name   = azurerm_resource_group.myResourceGroup.name
  network_interface_ids = [azurerm_network_interface.myNic.id]

  vm_size             = "Standard_B1s"
  delete_os_disk_on_termination = true

  storage_image_reference {
    publisher = "Canonical"
    offer     = "UbuntuServer"
    sku       = "18.04-LTS"
    version   = "latest"
  }

  storage_os_disk {
    name              = "myOsDisk"
    caching           = "ReadWrite"
    create_option     = "FromImage"
    managed_disk_type = "Standard_LRS"
  }

 // add OS linux profile
    os_profile {
        computer_name  = "myVM"
        admin_username = "myadmin"
        admin_password = "M1#yadminpassword"


    }
    
    os_profile_linux_config {
        disable_password_authentication = false
    }
    
    
}

output "public_ip_address" {
  value = azurerm_network_interface.myNic.private_ip_address
}
