// entire file content ...
// ... goes in between

function triggerRandomly() {
  const intervalInMinutes = 60 / 2; // 5 times per hour
  const intervalInMilliseconds = intervalInMinutes * 60 * 1000; // convert to milliseconds

  setInterval(() => {
    const randomNumber = Math.random();
    const channel = client.channels.cache.get("419977920249987097");
    const members = channel.members;
    // trigger something randomly based on the random number
    if (members.size > 1) {
      if (randomNumber < 0.4) {
        random_members = members;
        random_members.delete(botDiscId);
        const member = random_members.random();

        console.log(member.user.username);

        console.log('Random trigger!');
        chatgpt("Criador: Interage com o membro + " + member.user.username + " como se ele fosse um gato, em 10 palavras. Acaba a miar:", "False");
      }
    }
  }, intervalInMilliseconds);
}

function getDateTime() {
  var date = new Date();
  var hour = date.getHours();
  hour = (hour < 10 ? "0" : "") + hour;
  var min = date.getMinutes();
  min = (min < 10 ? "0" : "") + min;
  var sec = date.getSeconds();
  sec = (sec < 10 ? "0" : "") + sec;
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  month = (month < 10 ? "0" : "") + month;
  var day = date.getDate();
  day = (day < 10 ? "0" : "") + day;
  return day + "/" + month + "/" + year + " " + hour + ":" + min + ":" + sec;
}
