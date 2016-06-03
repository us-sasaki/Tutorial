import java.nio.*;
import java.nio.file.*;
import java.nio.file.attribute.UserPrincipal;

public class FileAttr {
	public static void main(String[] args) throws Exception {
		UserPrincipal up = Files.getOwner(Paths.get("FileAttr.java"));
		System.out.println(up.getName());
		System.out.println(up);
	}
}
