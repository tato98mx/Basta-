# Generador del diccionario de Basta (worker/src/dictionary.json).
# Listas compactas por categoria y letra; el script normaliza, deduplica y
# emite el JSON que importa el Worker. Ejecutar: python3 gen_dict.py
import json, pathlib, unicodedata, re

def norm(s):
    s = s.lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()

def L(s):
    out = []
    for w in s.split(","):
        w = w.strip()
        if w and norm(w) not in [norm(x) for x in out]:
            out.append(w)
    return out

D = {}

D["nombre"] = {
 "a": L("alejandro,ana,andrea,andrés,antonio,adriana,alberto,alicia,arturo,armando,alma,alfonso,aurora,abigail,araceli,adrián,agustín,alejandra,amelia,ángel"),
 "b": L("beatriz,bruno,brenda,bernardo,blanca,bárbara,benito,benjamín,belén,braulio,berenice,beto,berta,basilio,baltazar,brandon,bianca,brayan,bonifacio"),
 "c": L("carlos,carmen,claudia,césar,cristina,camila,christian,cecilia,carolina,concepción,clara,cristóbal,carla,celia,camilo,consuelo,catalina,carlos"),
 "d": L("daniel,daniela,david,diana,diego,dalia,dolores,damián,débora,danilo,dante,delfina,domingo,dora,dulce,dayana,demetrio,darío,daniela"),
 "e": L("eduardo,elena,ernesto,elisa,emilio,esperanza,esteban,erika,edgar,emanuel,elizabeth,enzo,emma,estefanía,elías,eduardo,ernestina,eva,emiliano"),
 "f": L("fernando,francisco,fabiola, felipe,fernanda, federico,fátima,florencia,fabián,frida,felix,flor,francisca,felipe,faustino,fernando"),
 "g": L("gabriel,gabriela,guillermo,gloria,gerardo,gustavo,genoveva,gonzalo,guadalupe,gregorio,gemma,gilberto,grisela,gabriela,gerardo,georgina"),
 "h": L("héctor,hugo,hilda,hernán,horacio,helena,heriberto,humberto,hortensia,henry,hernando,hilda,heidi,héctor,hilario"),
 "i": L("ignacio,irene,isabel,iván,ingrid,isaac,ismael,itzel,irma,inés,ivonne,isidro,ilse,íñigo,israel,ivette,ignacia,isaías,irma"),
 "j": L("jorge,josé,juan,jaime,javier,jesús,julia,juanita,josé luis, jacqueline, jonathan, josefina, julio, jazmín, jimena, joaquín, jorge, juana"),
 "k": L("karen,karla,kevin,kimberly,karim,kenia,kassandra,kristian,katia,kelly"),
 "l": L("luis,laura,lucas,lucía,leonardo,leticia,lorena,leonel,lidia,liliana,leonardo,luisa,lourdes,lucero,leonardo,luis miguel,lorenzo,luna,luis"),
 "m": L("maría,manuel,miguel,mariana,mario,marta,marco,martín,mauricio,monica,miguel ángel,magdalena,marisol,mateo,miriam,marcelo,mario,matías,mauricio"),
 "n": L("natalia,nicolás,norma,noé,naomi,nora,nuria,nahuel,néstor,nayeli,noelia,nicolás,nelson,naim,nancy,norma"),
 "o": L("oscar,olga,omar,orlando,ofelia,octavio,olivia,osvaldo,olegario,oriana,óscar,oliver,oscar,otilia,odalis"),
 "p": L("pedro,pablo,paula,patricia,paloma,paola,priscila,porfirio,pamela,patricio,pedro,paulina,perla,pablo,policarpo,placido"),
 "q": L("quetzal,quetzalli,quintín,quinn,quique,quetzal,quetzalcoatl"),
 "r": L("ricardo,rosa,roberto,raúl,rafael,ramón,renata,rodrigo,rubén,rosario,rené,rogelio,rita,rodolfo,ramiro,rosa maría,raquel,regina,roberto"),
 "s": L("sofía,santiago,sandra,sergio,silvia,sebastián,samuel,sonia,salvador,sara,susana,saúl,simón,stefanía,sofia,sergio,sara"),
 "t": L("tomás,teresa,tania,tatiana,teodoro,tobías,tania,teresa,tania,timoteo,tania,tania,tomas,tania,teresa"),
 "u": L("ulises,uriel,úrsula,ubaldo,uma,ulises,uriel,ursula,ulises"),
 "v": L("víctor,verónica,valeria,vanessa,vicente,victoria,viviana,virginia,valentín,violeta,vladimir,verónica,víctor,vicente,valeria"),
 "w": L("wendy,wilmer,wilson,wanda,walter,william,wenceslao,wilfrido,wendy,wilmer"),
 "x": L("ximena,xavier,xóchitl,xander,xenia,xavi,ximena,xavier,xóchitl"),
 "y": L("yadira,yahir,yamileth,yolanda,yair,yasmin,yoselin,yurem,yaretzi,yahir,yadira,yolanda"),
 "z": L("zoe,zacarías,zara,zulema,zenaida,zulma,zoe,zacarías,zara"),
}

D["apellido"] = {
 "a": L("aguilar,álvarez,alonso,acosta,andrade,arias,arriaga,ayala,acevedo,aguirre,alba,alcántara,alvarado,amador,ángeles,aragón,armenta,ávila,aguilar,alonso"),
 "b": L("barrios,barrera,benítez,blanco,bravo,bautista,bueno,beltrán,bermúdez,bolaños,bonilla,borges,brito,briones,bustamante,barajas,baca,borja,beltrán,barrera"),
 "c": L("castillo,campos,cruz,contreras,cortés,cabrera,cárdenas,corona,cerda,castro,chávez,cuenca,calderón,canales,carbajal,casas,cervantes,correa,cedillo,camacho"),
 "d": L("delgado,díaz,domínguez,duarte,del toro,de la cruz,de la rosa,del río,de león,durán,del valle,delgado,dávila,díaz,domínguez,del río"),
 "e": L("espinoza,estrada,esquivel,elizondo,escobar,espinosa,enríquez,esparza,estrada,elías,escobedo,espinoza,escobar,estrada,esquivel"),
 "f": L("fernández,flores,fuentes,figueroa,franco,félix,fierro,fuentes,flores,fernández,figueroa,franco,félix,fuentes,flores"),
 "g": L("gonzález,garcía,gutiérrez,guerrero,gómez,galván,galindo,guerra,godínez,guzmán,garza,garrido,gallegos,gil,gonzález,garcía"),
 "h": L("hernández,herrera,hidalgo,huerta,hurtado,hernández,herrera,hidalgo,huerta,hernández,herrera,hidalgo,huerta,hurtado,hernández"),
 "i": L("ibarra,iglesias,iriarte,ibáñez,iniesta,islas,irigoyen,iturbe,ibarra,iglesias,iriarte,ibáñez,iniesta,islas"),
 "j": L("jiménez,juárez,jasso,jaramillo,jiménez,juárez,jasso,jaramillo,jiménez,juárez,jasso,jaramillo,jiménez,juárez"),
 "k": L("kaiser,keller,king,krause,kovacs,kaiser,keller,king"),
 "l": L("lópez,luna,lara,león,ledezma,lerma,limón,lozano,laguna,león,lópez,luna,lara,león,ledezma,lerma,limón,lozano"),
 "m": L("martínez,mendoza,morales,medina,moreno,miranda,muñoz,marín,mata,mejía,maldonado,mora,mercado,montes,maqueda,marín,martínez,mendoza"),
 "n": L("navarro,nuñez,núñez,nava,nietos,noriega,nájera,navarrete,navarro,nuñez,nava,nietos,noriega,nájera,navarrete"),
 "o": L("ortiz,ortega,oliveros,ojeda,orozco,olmos,oviedo,ortiz,ortega,oliveros,ojeda,orozco,olmos,oviedo,ortiz"),
 "p": L("pérez,paredes,pena,peña,ponce,padilla,palacios,peralta,pineda,pacheco,palomo,prado,pecina,pérez,paredes,peña,ponce,padilla"),
 "q": L("quintana,quiñones,quintero,quesada,quijano,quiroz,quintana,quiñones,quintero,quesada"),
 "r": L("ramírez,rodríguez,reyes,rivera,rojas,romero,rios,ríos,rosales,rubio,ramos,robles,requena,ramírez,rodríguez,reyes,rivera,rojas"),
 "s": L("sánchez,santos,suárez,soto,salazar,solís,serrano,segura,silva,salinas,saavedra,soria,sandoval,sánchez,santos,suárez,soto,salazar"),
 "t": L("torres,torres,treviño,trejo,tapia,tejeda,toledo,téllez,torres,treviño,trejo,tapia,tejeda,toledo,téllez"),
 "u": L("ulloa,uribe,urquiza,urbina,urrea,urdaneta,ulloa,uribe,urquiza,urbina"),
 "v": L("vargas,vázquez,velázquez,vega,vera,vidal,villanueva,villalobos,valencia,valdez,vargas,vázquez,velázquez,vega,vera,vidal"),
 "w": L("wong,wagner,walsh,weber,williams,wright,wong,wagner,walsh,weber"),
 "x": L("ximénez,xavier,xu,xiong,ximénez,xavier"),
 "y": L("yáñez,yañez,ybarra,yepes,yuen,yoshida,yáñez,ybarra,yepes"),
 "z": L("zamora,zapata,zavala,zúñiga,zaragoza,zamudio,zermeño,zorrilla,zamora,zapata,zavala,zúñiga,zaragoza,zamudio"),
}

D["ciudad"] = {
 "a": L("acapulco,aguascalientes,alemania,argentina,argelia,atenas,atlanta,austin,alaska,ámsterdam,ankara,arabia,armenia,asunción,adelaida,alicante,antigua,aberdeen,acapulco,argentina"),
 "b": L("barcelona,berlín,bogotá,brasil,bolivia,boston,bruselas,budapest,buenos aires,bangkok,belice,bahamas,barbados,baltimore,bilbao,birmingham,barranquilla,bucarest,beirut,bangalore"),
 "c": L("cancún,canadá,chile,china,colombia,cuba,cairo,caracas,cartagena,córdoba,campeche,chihuahua,colima,cuernavaca,culiacán,cochabamba,calgary,cleveland,cincinnati,copenhague"),
 "d": L("dallas,denver,detroit,dublín,dubái,durango,dinamarca,damasco,dakar,delhi,dresde,dallas,denver,detroit,dublín,dubái,durango,dinamarca"),
 "e": L("ecuador,egipto,españa,edimburgo,el paso,ensenada,edmonton,estambul,escocia,etiopía,el salvador,estrasburgo,essen,erie,ecuador,egipto,españa,edimburgo"),
 "f": L("francia,finlandia,florencia,frankfurt,fresno,filadelfia,fiji,fargo,florianópolis,fort worth,francia,finlandia,florencia,frankfurt,fresno,filadelfia"),
 "g": L("guadalajara,guatemala,grecia,ghana,ginebra,glasgow,granada,guanajuato,guayaquil,génova,gdansk,grenoble,greensboro,guadalajara,guatemala,grecia,ghana,ginebra"),
 "h": L("honduras,holanda,haití,honolulu,houston,hamburgo,hermosillo,halifax,hiroshima,hanoi,harbin,hartford,honduras,holanda,haití,honolulu,houston,hamburgo"),
 "i": L("india,indonesia,inglaterra,irlanda,irak,irán,islandia,israel,italia,irapuato,ibiza,indianápolis,iquitos,izmir,iguazú,ibagué,ilo,ipiales,india,indonesia"),
 "j": L("japón,jamaica,jordania,jerusalén,jacksonville,jaipur,johannesburgo,jalapa,jerez,jersey,jutiapa,juárez,japón,jamaica,jordania,jerusalén,jacksonville,jaipur"),
 "k": L("kansas,kentucky,kenia,kiev,kioto,kuala lumpur,kuwait,karachi,kobe,kosovo,kansas,kentucky,kenia,kiev,kioto"),
 "l": L("león,lima,lisboa,londres,los ángeles,las vegas,la paz,liberia,libia,lituania,luxemburgo,lyon,liverpool,leeds,lagos,lahore,lancaster,loreto,los cabos,león"),
 "m": L("méxico,madrid,miami,milán,monterrey,mérida,morelia,mazatlán,managua,manila,melbourne,montreal,moscú,múnich,montevideo,marsella,málaga,memphis,milwaukee,minneapolis"),
 "n": L("nicaragua,nigeria,noruega,nueva york,nashville,nápoles,nantes,newcastle,nayarit,nogales,nueva orleans,nicosia,núremberg,nottingham,norfolk,nicaragua,nigeria,noruega,nueva york"),
 "o": L("oaxaca,oslo,orlando,ottawa,osaka,oporto,oakland,omaha,orizaba,oviedo,oxford,odense,ontario,orán,oaxaca,oslo,orlando,ottawa,osaka,oporto"),
 "p": L("puebla,parís,perú,panamá,polonia,portugal,praga,palermo,phoenix,pittsburgh,portland,pachuca,puerto vallarta,punta cana,plymouth,pisa,perth,pretoria,puebla,parís"),
 "q": L("querétaro,quito,qatar,quebec,queensland,quetzaltenango,quimper,querétaro,quito,qatar,quebec,quetzaltenango"),
 "r": L("roma,rusia,rumania,reynosa,rosario,rotterdam,raleigh,richmond,reno,recife,río de janeiro,rabat,riga,rochester,rockford,rosario,roma,rusia,rumania,reynosa"),
 "s": L("sevilla,sidney,santiago,san diego,san francisco,seattle,salvador,senegal,serbia,singapur,sofía,suecia,suiza,salamanca,saltillo,san luis potosí,santa fe,sarasota,sheffield,stuttgart"),
 "t": L("tampico,tijuana,tokio,toronto,texas,toluca,tlaxcala,túnez,turquía,taiwán,tailandia,tampa,tucson,tulsa,toledo,tegucigalpa,turín,toulouse,trípoli,teherán"),
 "u": L("uruguay,utah,ucrania,uganda,uruapan,ushuaia,utrecht,urumqi,udaipur,uruguay,utah,ucrania,uganda,uruapan,ushuaia"),
 "v": L("veracruz,valencia,venezuela,viena,vancouver,venecia,villahermosa,vigo,varsovia,verona,virginia,victoria,valparaíso,valladolid,vallejo,ventura,veracruz,valencia,venezuela,viena"),
 "w": L("washington,wellington,winnipeg,wisconsin,wuhan,warsaw,windsor,wichita,washington,wellington,winnipeg,wisconsin,wuhan"),
 "x": L("xalapa,xochimilco,xalisco,xela,xian,xiamen,xuzhou,xalapa,xochimilco,xalisco,xela,xian"),
 "y": L("yucatán,york,yosemite,yokohama,yalta,yeda,yopal,yumbo,yucatán,york,yosemite,yokohama,yalta"),
 "z": L("zacatecas,zamora,zapopan,zaragoza,zúrich,zanzíbar,zimbabwe,zambia,zagreb,zacatecas,zamora,zapopan,zaragoza,zúrich,zanzíbar"),
}

D["animal"] = {
 "a": L("abeja,águila,alce,alpaca,anaconda,antílope,araña,ardilla,armadillo,avestruz,atún,anguila,avispa,albatros,almeja,alacrán,armiño,asno,ajolote,anémona"),
 "b": L("ballena,bisonte,búho,burro,búfalo,babosa,bacalao,bagre,barracuda,basilisco,becerro,beluga,boa,borrego,buitre,búfalo,ballena,bisonte,búho,burro"),
 "c": L("caballo,camello,cangrejo,canario,canguro,capibara,caracol,castor,cebra,cerdo,ciervo,cisne,cocodrilo,colibrí,conejo,coyote,cuervo,culebra,camaleón,caballo"),
 "d": L("delfín,dingo,dromedario,dodo,damán,dorada,danta,dragón,delfín,dingo,dromedario,dodo,damán,dorada,danta,dragón de komodo"),
 "e": L("elefante,erizo,escorpión,escarabajo,estrella de mar,erizo de mar,esponja de mar,emu,elands,elefante,erizo,escorpión,escarabajo,emu,elefante marino"),
 "f": L("foca,flamenco,faisán,foca,foca,foca,foca"),
 "g": L("gato,gallina,gallo,ganso,gorila,gacela,guepardo,grillo,garza,gusano,gaviota,gato,gallina,gallo,ganso,gorila,gacela,guepardo,grillo,garza"),
 "h": L("hámster,hurón,hipopótamo,hiena,hormiga,halcón,hámster,hurón,hipopótamo,hiena,hormiga,halcón,hámster,hurón,hipopótamo,hiena"),
 "i": L("iguana,insecto,ibis,impala,iguana,insecto,ibis,impala,iguana,insecto,ibis,impala"),
 "j": L("jaguar,jabalí,jirafa,jaguar,jabalí,jirafa,jaguar,jabalí,jirafa,jaguar,jabalí,jirafa,jaguar,jabalí,jirafa"),
 "k": L("koala,kiwi,kodiak,krill,kudu,komodo,koala,kiwi,kodiak,krill,kudu"),
 "l": L("león,lagarto,liebre,lince,lobo,loro,lombriz,langosta,libélula,lagartija,leopardo,lemur,león,lagarto,liebre,lince,lobo,loro,lombriz,langosta"),
 "m": L("mono,murciélago,mapache,mariposa,morsa,mosca,mula,medusa,mamut,mandril,musaraña,mono,murciélago,mapache,mariposa,morsa,mosca,mula,medusa,mamut"),
 "n": L("nutria,narval,nutria,narval,nutria,narval,nutria,narval,nutria,narval"),
 "o": L("oso,oveja,ornitorrinco,oca,orangután,oso,oveja,ornitorrinco,oca,orangután,oso,oveja,ornitorrinco,oca"),
 "p": L("perro,pato,pingüino,puma,pantera,puercoespín,pollo,paloma,pez,perico,pelícano,pulpo,perro,pato,pingüino,puma,pantera,puercoespín,pollo,paloma"),
 "q": L("quetzal,quirquincho,quokka,quelea,quetzal,quirquincho,quokka,quelea"),
 "r": L("rata,ratón,rana,reno,rinoceronte,ruiseñor,raya,róbalo,roedor,rana,rata,ratón,reno,rinoceronte,ruiseñor,raya,róbalo"),
 "s": L("serpiente,sapo,salamandra,sardina,salmón,saltamontes,suricata,sapo,serpiente,salamandra,sardina,salmón,saltamontes,suricata,sapo,serpiente"),
 "t": L("tigre,tiburón,tortuga,tucán,toro,topo,tarántula,tiburón,tigre,tortuga,tucán,toro,topo,tarántula,tigre,tiburón,tortuga"),
 "u": L("urraca,urogallo,uapití,uro,urón,uakari,urraca,urogallo,uapití,uro,urón"),
 "v": L("vaca,venado,víbora,volador,buitre,vaca,venado,víbora,vaca,venado,víbora,vaca,venado,víbora,vaca,venado"),
 "w": L("wallaby,wombat,wapití,walabí,wallaby,wombat,wapití,walabí"),
 "x": L("xoloitzcuintle,xenopus,xerus,xifio,xoloitzcuintle,xenopus,xerus"),
 "y": L("yak,yegua,yaguareté,yacaré,yaco,yak,yegua,yaguareté,yacaré,yaco"),
 "z": L("zorro,zarigüeya,zancudo,zopilote,zambullidor,zorro,zarigüeya,zancudo,zopilote,zambullidor"),
}

D["fruta"] = {
 "a": L("aguacate,apio,acelga,alcachofa,ajo,arándano,albaricoque,almendra,avellana,aguacate,apio,acelga,alcachofa,ajo,arándano,albaricoque,almendra,avellana,aguacate"),
 "b": L("banana,betabel,berenjena,brócoli,boniato,batata,berro,borraja,banana,betabel,berenjena,brócoli,boniato,batata,berro,borraja"),
 "c": L("calabaza,cebolla,cilantro,col,coliflor,camote,cereza,coco,ciruela,chayote,chícharo,calabacín,caqui,castaña,cebollín,champiñón,chirimoya,calabaza,cebolla,cilantro"),
 "d": L("durazno,dátil,daikon,durian,durazno,dátil,daikon,durian,durazno,dátil,daikon"),
 "e": L("elote,espinaca,espárrago,endivia,eneldo,escarola,elote,espinaca,espárrago,endivia,eneldo,escarola,elote,espinaca"),
 "f": L("fresa,frambuesa,frijol,fenogreco,fresa,frambuesa,frijol,fenogreco,fresa,frambuesa,frijol"),
 "g": L("guayaba,granada,guanábana,garbanzo,gengibre,grosella,guisante,granadilla,guayaba,granada,guanábana,garbanzo,gengibre,grosella,guisante,granadilla"),
 "h": L("higo,haba,hinojo,hierbabuena,higo,haba,hinojo,hierbabuena,higo,haba,hinojo,hierbabuena"),
 "i": L("icaco,iceberg,icaco,iceberg,icaco,iceberg"),
 "j": L("jícama,jengibre,jitomate,judía,jalapeño,jocote,jamaica,jobo,jícama,jengibre,jitomate,judía,jalapeño,jocote,jamaica"),
 "k": L("kiwi,kumquat,kaki,kale,kion,kiwi,kumquat,kaki,kale,kion"),
 "l": L("lechuga,limón,lima,lenteja,lichi,lúcuma,laurel,lechuga,limón,lima,lenteja,lichi,lúcuma,laurel,lechuga,limón,lima,lenteja"),
 "m": L("mango,manzana,melón,mandarina,maíz,mora,membrillo,mamey,mandioca,mostaza,morrón,melocotón,maracuyá,menta,mango,manzana,melón,mandarina,maíz,mora"),
 "n": L("naranja,nectarina,nopal,nuez,níspero,nabo,noni,naranja,nectarina,nopal,nuez,níspero,nabo,noni,naranja,nectarina"),
 "o": L("oliva,orégano,okra,oliva,orégano,okra,oliva,orégano,okra"),
 "p": L("papa,pepino,pera,piña,papaya,plátano,pimiento,perejil,poro,puerro,pitaya,pimentón,pistache,pomelo,patata,papa,pepino,pera,piña,papaya"),
 "q": L("quinoto,quenepa,quinoto,quenepa,quinoto,quenepa"),
 "r": L("rábano,romero,repollo,remolacha,ruibarbo,rambután,romanesco,rábano,romero,repollo,remolacha,ruibarbo,rambután,romanesco,rábano,romero"),
 "s": L("sandía,seta,soya,salvia,sorgo,sandía,seta,soya,salvia,sorgo,sandía,seta,soya,salvia"),
 "t": L("tomate,toronja,tamarindo,tuna,tomatillo,tapioca,tangerina,tomate,toronja,tamarindo,tuna,tomatillo,tapioca,tangerina,tomate,toronja"),
 "u": L("uva,uchuva,ugli,ulluco,umbu,uva,uchuva,ugli,ulluco,umbu"),
 "v": L("vainilla,verdolaga,vaina,vainilla,verdolaga,vaina,vainilla,verdolaga,vaina"),
 "w": L("wampi,wolfberry,wax apple,wampi,wolfberry,wax apple"),
 "x": L("xoconostle,xigua,ximenia,xoconostle,xigua,ximenia"),
 "y": L("yaca,yuzu,yangmei,yaca,yuzu,yangmei,yaca,yuzu"),
 "z": L("zapote,zarzamora,zanahoria,zapallo,zucchini,zapote,zarzamora,zanahoria,zapallo,zucchini"),
}

D["comida"] = {
 "a": L("arroz,asado,arepa,albóndigas,arroz con leche,aguachile,anticuchos,ají de gallina,alitas,avena,arepa,arroz,asado,albóndigas,arroz con leche,aguachile,anticuchos,ají de gallina,alitas,avena"),
 "b": L("birria,burrito,barbacoa,bistec,budín,buñuelo,baguette,brownie,bacalao,birria,burrito,barbacoa,bistec,budín,buñuelo,baguette,brownie,bacalao,birria"),
 "c": L("ceviche,carnitas,chilaquiles,caldo,cochinita,churros,camarones,consomé,croquetas,cupcakes,curry,cuscús,chorizo,calzone,capirotada,ceviche,carnitas,chilaquiles,caldo,cochinita"),
 "d": L("donas,dulce de leche,dumplings,doritos,dashi,dal,dosa,donut,donas,dulce de leche,dumplings,doritos,dashi,dal,dosa"),
 "e": L("empanada,enchilada,ensalada,elote,escabeche,espagueti,estofado,empanada,enchilada,ensalada,elote,escabeche,espagueti,estofado,empanada,enchilada,ensalada"),
 "f": L("flan,frijoles,fajitas,fondue,focaccia,frituras,fideos,flautas,falafel,filete,fettuccine,frittata,flan,frijoles,fajitas,fondue,focaccia,frituras,fideos,flautas"),
 "g": L("guacamole,gorditas,galletas,gazpacho,gnocchi,gelatina,gumbo,granola,gyros,guisado,guacamole,gorditas,galletas,gazpacho,gnocchi,gelatina,gumbo,granola,gyros,guisado"),
 "h": L("hamburguesa,huevo,hot dog,hummus,helado,hígado encebollado,hot cakes,huarache,hojaldre,hamburguesa,huevo,hot dog,hummus,helado,hígado encebollado,hot cakes,huarache,hojaldre"),
 "i": L("idli,injera,insalata caprese,involtini,idli,injera,insalata caprese,involtini"),
 "j": L("jamón,jalapeño,jugo,jícama,jericalla,jocoque,jamoncillo,jalea,jitomate,jamón,jalapeño,jugo,jícama,jericalla,jocoque,jamoncillo,jalea"),
 "k": L("kebab,kimchi,ketchup,kéfir,kuchen,katsu,korma,kebab,kimchi,ketchup,kéfir,kuchen,katsu"),
 "l": L("lasaña,lentejas,licuado,lechón,lomito,locro,lumpia,langosta,limonada,lasaña,lentejas,licuado,lechón,lomito,locro,lumpia,langosta,limonada,lasaña"),
 "m": L("mole,menudo,milanesa,macarrones,mazapán,muffin,mousse,machaca,molletes,mariscos,mermelada,mole,menudo,milanesa,macarrones,mazapán,muffin,mousse,machaca,molletes,mariscos"),
 "n": L("nachos,natilla,noodles,nuggets,nopalitos,nachos,natilla,noodles,nuggets,nopalitos,nachos,natilla,noodles,nuggets"),
 "o": L("omelette,ostiones,okonomiyaki,ossobuco,ostras,olivas,omelette,ostiones,okonomiyaki,ossobuco,ostras,olivas"),
 "p": L("pizza,pasta,pozole,pan,pollo,pastel,papas fritas,pescado,paella,picadillo,pupusas,palomitas,pancakes,pesto,pibil,pambazo,pernil,pizza,pasta,pozole"),
 "q": L("quesadilla,queso,quiche,quinoa,queso fundido,quesadilla,queso,quiche,quinoa,queso fundido,quesadilla,queso"),
 "r": L("ramen,ravioles,rosca,relleno,rajas,risotto,romeritos,requesón,rollo,rosca de reyes,ramen,ravioles,rosca,relleno,rajas,risotto,romeritos,requesón,rollo,rosca de reyes"),
 "s": L("sopa,sándwich,sushi,salmón,salsa,salchicha,spaghetti,sopes,salpicón,sorbete,sancocho,shawarma,souvlaki,scones,sopa,sándwich,sushi,salmón,salsa,salchicha"),
 "t": L("tacos,tamales,torta,tortilla,tinga,tostadas,tlayuda,tiramisú,tofu,tarta,torta ahogada,tacos al pastor,tacos,tamales,torta,tortilla,tinga,tostadas,tlayuda,tiramisú"),
 "u": L("uchepos,udon,uchepos,udon,uchepos,udon"),
 "v": L("volcán de chocolate,vainilla,vinagreta,vitello,volcán de chocolate,vainilla,vinagreta,vitello"),
 "w": L("waffles,wasabi,wok,wonton,wrap,waffles,wasabi,wok,wonton,wrap"),
 "x": L("xnipec,xoconostle,xnipec,xoconostle,xnipec,xoconostle"),
 "y": L("yakisoba,yakitori,yogur,yuca,yautía,yakisoba,yakitori,yogur,yuca,yautía"),
 "z": L("zarzuela,zamburiñas,ziti,zarzuela,zamburiñas,ziti,zarzuela,zamburiñas"),
}

D["cosa"] = {
 "a": L("avión,auto,abanico,almohada,alfombra,anillo,antena,agenda,armario,arpa,aro,aspiradora,auriculares,abrelatas,alcancía,avión,auto,abanico,almohada,alfombra"),
 "b": L("bicicleta,balón,barco,botella,bolso,bombilla,brújula,bufanda,bastón,bate,baúl,bocina,boleto,bomba,borrador,bote,brocha,buzón,bicicleta,balón"),
 "c": L("cama,carro,casa,celular,computadora,cámara,cuchillo,cuchara,cuaderno,casco,cadena,candado,camisa,cepillo,copa,cortina,colchón,cometa,cofre,cubo"),
 "d": L("dado,diario,ducha,destornillador,disco,diccionario,dardo,delantal,diamante,diadema,dron,detergente,despertador,diploma,dado,diario,ducha,destornillador,disco,diccionario"),
 "e": L("espejo,escoba,escalera,escritorio,estufa,esponja,encendedor,enchufe,equipaje,estante,estatua,escudo,etiqueta,esmalte,espejo,escoba,escalera,escritorio,estufa,esponja"),
 "f": L("florero,foco,foto,fregadero,falda,flecha,flauta,folleto,fósforo,fuente,faro,frasco,freno,frigorífico,florero,foco,foto,fregadero,falda,flecha"),
 "g": L("gafas,guitarra,gorra,globo,guante,grifo,grapadora,gorro,goma,gabinete,gancho,garrafa,generador,guante,gafas,guitarra,gorra,globo,guante,grifo"),
 "h": L("hamaca,horno,hervidor,helicóptero,hacha,hilo,hoja,horquilla,hamaca,horno,hervidor,helicóptero,hacha,hilo,hoja,horquilla"),
 "i": L("imán,impresora,impermeable,interruptor,inodoro,incienso,instrumento,insignia,inflador,inhalador,intercomunicador,imán,impresora,impermeable,interruptor,inodoro,incienso,instrumento,insignia"),
 "j": L("jabón,jarra,joya,juguete,jarrón,jaula,jeringa,joyero,jersey,jabonera,jabón,jarra,joya,juguete,jarrón,jaula,jeringa,joyero,jersey,jabonera"),
 "k": L("kimono,kiosco,kayak,kart,kettlebell,karaoke,kimono,kiosco,kayak,kart,kettlebell,karaoke"),
 "l": L("lámpara,lápiz,libro,llave,licuadora,linterna,lavadora,lentes,lona,libreta,lupa,letrero,listón,litera,llavero,lámpara,lápiz,libro,llave,licuadora"),
 "m": L("mesa,moto,micrófono,maleta,martillo,mapa,manguera,moneda,mochila,muñeca,máquina,mantel,marco,mascarilla,microondas,microscopio,molino,monitor,motor,mueble"),
 "n": L("nevera,navaja,neumático,novela,nido,nevera,navaja,neumático,novela,nido,nevera,navaja,neumático,novela"),
 "o": L("olla,oso de peluche,ordenador,oficina,organizador,olla,oso de peluche,ordenador,oficina,organizador,olla,oso de peluche,ordenador,oficina"),
 "p": L("puerta,pantalón,peine,piano,piedra,piscina,plato,pluma,peluche,parrilla,paraguas,patines,pared,pizarra,planta,portátil,pulsera,proyector,puente,pala"),
 "q": L("quena,quesera,quiosco,quemador,quena,quesera,quiosco,quemador"),
 "r": L("radio,reloj,raqueta,refrigerador,regla,ropa,rueda,reflector,regadera,riel,robot,rodillo,ropero,rompecabezas,remo,reja,radio,reloj,raqueta,refrigerador"),
 "s": L("silla,sofá,sombrero,sillón,sandalias,secadora,sartén,servilleta,suéter,sombrilla,sierra,silbato,sobre,silla de ruedas,submarino,silla,sofá,sombrero,sillón,sandalias,secadora"),
 "t": L("teléfono,televisor,taza,teclado,tijeras,toalla,tambor,tanque,techo,tenedor,termo,timbre,tostador,tren,trompeta,trineo,tina,traje,trofeo,teléfono"),
 "u": L("ukulele,uniforme,urna,utensilio,ukulele,uniforme,urna,utensilio,ukulele,uniforme,urna"),
 "v": L("vaso,vela,ventana,ventilador,vestido,violín,videojuego,valla,varita,velero,vestidor,visor,vitrina,volante,vaso,vela,ventana,ventilador,vestido,violín"),
 "w": L("walkie-talkie,webcam,windsurf,wok,walkie-talkie,webcam,windsurf,wok"),
 "x": L("xilófono,x-acto,xenón,xilófono,x-acto,xenón"),
 "y": L("yate,yelmo,yoyo,yeso,yunque,yate,yelmo,yoyo,yeso,yunque"),
 "z": L("zapato,zapatilla,zarcillo,zíper,zarape,zapato,zapatilla,zarcillo,zíper,zarape"),
}

BONUS = {
 "superheroe": L("superman,batman,spider-man,iron man,hulk,thor,wonder woman,flash,aquaman,capitán américa,black panther,doctor strange,deadpool,wolverine,daredevil,green lantern,ant-man,capitana marvel,viuda negra,hawkeye,cyborg,robin,supergirl,batichica,shazam,green arrow,falcon,winter soldier,star-lord,groot,rocket,gamora,vision,scarlet witch,storm,cyclops,jean grey,professor x,magneto,mystique,rogue,gambit,nightcrawler,beast,iceman,colossus,punisher,ghost rider,blade,moon knight,ms marvel,nova,sentry"),
 "deporte": L("fútbol,baloncesto,voleibol,tenis,natación,boxeo,béisbol,golf,rugby,hockey,ciclismo,atletismo,gimnasia,surf,esquí,patinaje,escalada,remo,lucha libre,karate,judo,taekwondo,esgrima,tiro con arco,maratón,triatlón,motociclismo,automovilismo,polo,cricket,bádminton,squash,waterpolo,balonmano,softball,skateboarding,snowboard,paracaidismo,buceo,equitación,fútbol americano,fútbol soccer"),
 "cantante": L("shakira,bad bunny,taylor swift,bts,coldplay,the beatles,queen,metallica,madonna,beyoncé,ed sheeran,adele,luis miguel,juan gabriel,selena,rihanna,drake,eminem,nirvana,pink floyd,rolling stones,u2,abba,ac/dc,guns n' roses,linkin park,maroon 5,imagine dragons,one direction,bruno mars,justin bieber,ariana grande,dua lipa,billie eilish,peso pluma,karol g,maluma,j balvin,rosalía,maná,café tacvba,soda stereo,los tigres del norte,vicente fernández,alejandro fernández,thalía,paulina rubio,gloria trevi"),
 "marca": L("nike,adidas,apple,samsung,coca-cola,pepsi,mcdonald's,toyota,ford,ferrari,bmw,mercedes-benz,lego,disney,netflix,amazon,google,microsoft,sony,nintendo,zara,h&M,puma,reebok,vans,converse,levi's,chanel,gucci,louis vuitton,rolex,ikea,starbucks,burger king,kfc,domino's,bimbo,telcel,telmex"),
 "videojuego": L("mario bros,zelda,minecraft,fortnite,fifa,call of duty,gta,pokémon,tetris,pac-man,sonic,halo,god of war,the last of us,elden ring,roblox,among us,clash royale,candy crush,free fire,pubg,league of legends,valorant,overwatch,apex legends,rocket league,mortal kombat,street fighter,resident evil,assassin's creed,red dead redemption"),
}

# --- Parches: completar celdas flojas (se fusionan y se deduplica) ---
PATCH = {
 ("nombre","t"): ["tadeo","tamara","tarik","telma","teo","thiago","tito","tomasa","trinidad","tulio","talía","teófilo"],
 ("nombre","d"): ["damián","diego","dante"],
 ("nombre","f"): ["federico","faustino","felipe","flora"],
 ("nombre","j"): ["jacobo","jesica","jordi","josué"],
 ("nombre","u"): ["ulises","uriel","uma","ursula"],
 ("nombre","q"): ["quetzalli","quintín"],
 ("animal","f"): ["frailecillo","foca monje","felino"],
 ("animal","e"): ["eland","elefante marino","erizo de mar"],
 ("animal","n"): ["naja","nécora","nautilus","nutria"],
 ("animal","v"): ["vicuña","vizcacha","vaca marina"],
 ("animal","d"): ["dugongo","diablo de tasmania","delfín rosado"],
 ("animal","i"): ["impala","ibis","iguana marina"],
 ("animal","j"): ["jaguarundi","jerbo","jilguero"],
 ("animal","o"): ["ocelote","oso panda","oso polar","oso hormiguero"],
 ("animal","h"): ["hipocampo","hurón","hiena"],
 ("animal","k"): ["koala","kiwi"],
 ("fruta","i"): ["icaco","iceberg"],
 ("fruta","d"): ["durazno","dátil","daikon","durian"],
 ("fruta","f"): ["fresa","frambuesa","frijol","fenogreco"],
 ("fruta","h"): ["higo","haba","hinojo","hierbabuena"],
 ("fruta","o"): ["oliva","orégano","okra"],
 ("fruta","v"): ["vainilla","verdolaga","vaina"],
 ("fruta","w"): ["wampi","wolfberry"],
 ("fruta","x"): ["xoconostle","xigua","ximenia"],
 ("fruta","u"): ["uva","uchuva","ugli","ulluco","umbu"],
 ("comida","i"): ["idli","injera","insalata caprese","involtini"],
 ("comida","d"): ["donas","dulce de leche","dumplings","doritos","dashi","dal","dosa"],
 ("comida","u"): ["uchepos","udon"],
 ("comida","v"): ["volcán de chocolate","vainilla","vinagreta","vitello"],
 ("comida","x"): ["xnipec","xoconostle"],
 ("comida","z"): ["zarzuela","zamburiñas","ziti"],
 ("cosa","f"): ["florero","foco","foto","fregadero","falda","flecha","flauta","folleto","fósforo","fuente","faro","frasco","freno","frigorífico"],
 ("cosa","n"): ["nevera","navaja","neumático","novela","nido"],
 ("cosa","o"): ["olla","oso de peluche","ordenador","oficina","organizador"],
 ("cosa","i"): ["imán","impresora","impermeable","interruptor","inodoro","incienso","instrumento","insignia","inflador","inhalador","intercomunicador"],
 ("cosa","q"): ["quena","quesera","quiosco","quemador"],
 ("cosa","u"): ["ukulele","uniforme","urna","utensilio"],
 ("cosa","w"): ["walkie-talkie","webcam","windsurf","wok"],
 ("cosa","x"): ["xilófono","x-acto","xenón"],
 ("cosa","y"): ["yate","yelmo","yoyo","yeso","yunque"],
 ("cosa","z"): ["zapato","zapatilla","zarcillo","zíper","zarape"],
 ("cosa","k"): ["kimono","kiosco","kayak","kart","kettlebell","karaoke"],
 ("cosa","h"): ["hamaca","horno","hervidor","helicóptero","hacha","hilo","hoja","horquilla"],
 ("cosa","j"): ["jabón","jarra","joya","juguete","jarrón","jaula","jeringa","joyero","jersey","jabonera"],
 ("ciudad","d"): ["dallas","denver","detroit","dublín","dubái","durango","dinamarca","damasco","dakar","delhi","dresde"],
 ("ciudad","f"): ["francia","finlandia","florencia","frankfurt","fresno","filadelfia","fiji","fargo","florianópolis","fort worth"],
 ("ciudad","e"): ["ecuador","egipto","españa","edimburgo","el paso","ensenada","edmonton","estambul","escocia","etiopía","el salvador","estrasburgo","essen","erie"],
 ("ciudad","k"): ["kansas","kentucky","kenia","kiev","kioto","kuala lumpur","kuwait","karachi","kobe","kosovo"],
 ("ciudad","q"): ["querétaro","quito","qatar","quebec","queensland","quetzaltenango","quimper"],
 ("ciudad","u"): ["uruguay","utah","ucrania","uganda","uruapan","ushuaia","utrecht","urumqi","udaipur"],
 ("ciudad","w"): ["washington","wellington","winnipeg","wisconsin","wuhan","warsaw","windsor","wichita"],
 ("ciudad","x"): ["xalapa","xochimilco","xalisco","xela","xian","xiamen","xuzhou"],
 ("ciudad","y"): ["yucatán","york","yosemite","yokohama","yalta","yeda","yopal","yumbo"],
 ("ciudad","z"): ["zacatecas","zamora","zapopan","zaragoza","zúrich","zanzíbar","zimbabwe","zambia","zagreb"],
 ("apellido","h"): ["hernández","herrera","hidalgo","huerta","hurtado"],
 ("apellido","i"): ["ibarra","iglesias","iriarte","ibáñez","iniesta","islas","irigoyen","iturbe"],
 ("apellido","j"): ["jiménez","juárez","jasso","jaramillo"],
 ("apellido","k"): ["kaiser","keller","king","krause","kovacs"],
 ("apellido","q"): ["quintana","quiñones","quintero","quesada","quijano","quiroz"],
 ("apellido","u"): ["ulloa","uribe","urquiza","urbina","urrea","urdaneta"],
 ("apellido","w"): ["wong","wagner","walsh","weber","williams","wright"],
 ("apellido","x"): ["ximénez","xavier","xu","xiong"],
 ("apellido","y"): ["yáñez","ybarra","yepes","yuen","yoshida"],
 ("apellido","d"): ["delgado","díaz","domínguez","duarte","del toro","de la cruz","de la rosa","del río","de león","durán","del valle","dávila"],
 ("apellido","e"): ["espinoza","estrada","esquivel","elizondo","escobar","enríquez","esparza","escobedo"],
 ("apellido","n"): ["navarro","núñez","nava","nietos","noriega","nájera","navarrete"],
 ("apellido","t"): ["torres","treviño","trejo","tapia","tejeda","toledo","téllez"],
}

for (cat, letter), words in PATCH.items():
    cur = D[cat].setdefault(letter, [])
    for w in words:
        if norm(w) not in [norm(x) for x in cur]:
            cur.append(w)

out = {"categories": D, "bonus": BONUS}
path = pathlib.Path(__file__).parent / "worker" / "src" / "dictionary.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

# Validación de cobertura
letters = [chr(c) for c in range(ord("a"), ord("z") + 1)]
common = set("abcdefghijlmnoprstv")
hard = set("kquwxyz")
total = 0
print(f"{'cat':12} {'common>=10':>10} {'common<10':>10} {'hard>=2':>8} {'hard<2':>7} {'total':>6}")
for cat, by_letter in D.items():
    c_ok = c_bad = h_ok = h_bad = 0
    for L_ in letters:
        n = len(by_letter.get(L_, []))
        total += n
        if L_ in common:
            if n >= 10: c_ok += 1
            else: c_bad += 1
        else:
            if n >= 2: h_ok += 1
            else: h_bad += 1
    print(f"{cat:12} {c_ok:>10} {c_bad:>10} {h_ok:>8} {h_bad:>7} {sum(len(v) for v in by_letter.values()):>6}")
    for L_ in letters:
        n = len(by_letter.get(L_, []))
        if n == 0:
            print(f"  !! VACÍA {cat}/{L_.upper()}")
        elif L_ in common and n < 10:
            print(f"  -- floja {cat}/{L_.upper()}: {n} -> {by_letter.get(L_)}")
        elif L_ in hard and n < 2:
            print(f"  -- floja hard {cat}/{L_.upper()}: {n} -> {by_letter.get(L_)}")
print("TOTAL palabras main:", total)
print("TOTAL bonus:", sum(len(v) for v in BONUS.values()), {k: len(v) for k, v in BONUS.items()})
print("Escrito en", path)

# --- PATCH2: reforzar celdas flojas ---
PATCH2 = {
 ("fruta","a"): ["anón","alcaparra"],
 ("fruta","b"): ["bayas de goji","bambú","bok choy"],
 ("fruta","d"): ["damson","diente de león"],
 ("fruta","e"): ["edamame","echalote"],
 ("fruta","f"): ["frijol verde","flor de calabaza","fruta de la pasión"],
 ("fruta","h"): ["habichuela","hierba mora"],
 ("fruta","i"): ["ingá", "ilama"],
 ("fruta","j"): ["judía verde"],
 ("fruta","l"): ["lechuga romana","lima kaffir"],
 ("fruta","n"): ["nuez de brasil","nuez moscada"],
 ("fruta","o"): ["oca","olluco","oreja de judas"],
 ("fruta","r"): ["rúcula"],
 ("fruta","s"): ["salsifí","sésamo","shiitake"],
 ("fruta","t"): ["taro","trufa"],
 ("fruta","v"): ["vainita","vetabel"],
 ("animal","f"): ["foca leopardo","foca gris"],
 ("animal","h"): ["halcón peregrino","hormiga león","hámster dorado"],
 ("animal","i"): ["iguana verde","insecto palo"],
 ("animal","j"): ["jurel","jibia","jaguar negro"],
 ("animal","n"): ["nutria marina"],
 ("animal","o"): ["ostra","ostión","oruga","oso pardo"],
 ("animal","r"): ["rana toro","ratón de campo","rinoceronte blanco"],
 ("animal","s"): ["serpiente cascabel","sapo dorado"],
 ("animal","t"): ["tiburón blanco","tortuga marina"],
 ("animal","v"): ["víbora de cascabel"],
 ("comida","n"): ["nopal asado","nuggets de pollo"],
 ("comida","o"): ["olla de carne","ostras gratinadas","omelette de queso"],
 ("comida","v"): ["verduras salteadas","vitel toné","volován"],
 ("comida","i"): ["isla flotante", "ibérico"],
 ("apellido","f"): ["falcón","ferreira","fresnedo","fabela"],
 ("apellido","h"): ["hoyos","hermosa","heredia","hinojosa"],
 ("apellido","j"): ["jaimes","jara"],
 ("apellido","l"): ["lagunes","larios","leal","leyva","lobo"],
 ("apellido","n"): ["naranjo","nogales","novoa"],
 ("apellido","o"): ["olguín","ortuño","oliva","orantes"],
 ("apellido","t"): ["tejada","tovar","trujillo","tirado"],
 ("apellido","i"): ["izquierdo","irala"],
 ("cosa","h"): ["hilo dental","hoja de afeitar","hucha"],
 ("cosa","n"): ["neceser","navaja suiza"],
 ("cosa","o"): ["orejeras","olla exprés"],
}
REMOVALS = {
 ("animal","v"): ["volador"],
 ("animal","e"): ["elands"],
}
for (cat, letter), words in PATCH2.items():
    cur = D[cat].setdefault(letter, [])
    for w in words:
        if norm(w) not in [norm(x) for x in cur]:
            cur.append(w)
for (cat, letter), words in REMOVALS.items():
    cur = D[cat].get(letter, [])
    D[cat][letter] = [w for w in cur if norm(w) not in [norm(x) for x in words]]


# --- PATCH3 (?v=8, 2026-11-11): palabras que dieron 0/50 en vivo siendo válidas
# ("calamar" en Animal; "caca"/"caja"/"caza" en Cosa) + refuerzo de celdas flojas.
PATCH3 = {
 ("animal","c"): ["calamar","caimán","cotorra","codorniz","cordero","cuco","chivo","chango","chimpancé","chita"],
 ("animal","p"): ["perra"],
 ("animal","q"): ["quebrantahuesos"],
 ("animal","w"): ["weimaraner"],
 ("animal","x"): ["xolo"],
 ("cosa","c"): ["caca","caja","caza","canasta","cajón","calcetín","calendario","candela","canoa","capa","cartel","cazuela","cerrojo","chaleco","chicle","chimenea","chamarra","chanclas","cinturón","collar","corbata","corona","crema","cuerda","cuna"],
 ("cosa","q"): ["quinqué"],
 ("cosa","u"): ["usb"],
 ("cosa","w"): ["wáter"],
 ("fruta","y"): ["yuca"],
 ("comida","u"): ["uvas pasas"],
 ("comida","z"): ["zumo"],
}
for (cat, letter), words in PATCH3.items():
    cur = D[cat].setdefault(letter, [])
    for w in words:
        if norm(w) not in [norm(x) for x in cur]:
            cur.append(w)

out = {"categories": D, "bonus": BONUS}
path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("--- tras PATCH2 ---")
for cat, by_letter in D.items():
    tot = sum(len(v) for v in by_letter.values())
    low = [f"{k.upper()}:{len(v)}" for k, v in sorted(by_letter.items()) if len(v) < 5]
    print(f"{cat:12} total={tot:4} celdas<5: {low}")
print("TOTAL main:", sum(len(v) for by_letter in D.values() for v in by_letter.values()))
