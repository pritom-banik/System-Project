const btn=document.getElementsByTagName("button")[0];

btn.addEventListener("click",function(){
    const txt=document.querySelector("h6");
    txt.textContent="The text has been changed";
});