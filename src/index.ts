class Person {
    private name: string;
  
    public constructor(name: string) {
      this.name = name;
    }
  
    public call(): string {
        return this.name;
    }

    public testPerson(): string {
      return "test";
    }
  }
  
export { Person };